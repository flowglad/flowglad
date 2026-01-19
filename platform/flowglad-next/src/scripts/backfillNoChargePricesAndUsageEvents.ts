/*
Run the following in the terminal:
bunx tsx src/scripts/backfillNoChargePricesAndUsageEvents.ts

SAFETY: This script is hardcoded to ONLY run against localhost databases.
To run against production, you must:
1. Remove the LOCAL_DATABASE_URL_ONLY check
2. Update the runScript call to use the appropriate database URL

This script:
1. Creates no_charge prices for all existing usage meters that don't have one
2. Sets the no_charge price as default only if the meter has no existing default price
3. Backfills all usage events with priceId: null to use the no_charge price for their meter

=== WHY A SCRIPT INSTEAD OF A MIGRATION? ===

This is a DATA migration (inserting/updating records), not a SCHEMA migration (DDL).
Drizzle auto-generates migrations from schema changes - we don't manually write them.

This script has complex business logic that would be painful in raw SQL:
- Looks up organization.defaultCurrency for each meter's pricing
- Conditionally sets isDefault only if no existing default price exists
- Uses shared TypeScript helpers (createNoChargePriceInsert, getNoChargeSlugForMeter)
- Needs to map inserted prices back to meters for the event backfill step

Could theoretically be done in SQL with CTEs, but this is more readable and testable.

=== VERIFICATION QUERIES ===

Run these against the database after the backfill to verify it worked:

-- 1. Count of usage meters vs no_charge prices (should match)
SELECT
  (SELECT COUNT(*) FROM usage_meters) as total_usage_meters,
  (SELECT COUNT(*) FROM prices WHERE slug LIKE '%_no_charge') as total_no_charge_prices;

-- 2. Check if any usage events still have null priceId (should be 0)
SELECT COUNT(*) as events_with_null_price_id
FROM usage_events
WHERE price_id IS NULL;

-- 3. Verify no_charge prices have correct properties (all counts should match)
SELECT
  COUNT(*) as total_no_charge_prices,
  COUNT(*) FILTER (WHERE unit_price = 0) as with_zero_price,
  COUNT(*) FILTER (WHERE active = true) as active_prices,
  COUNT(*) FILTER (WHERE is_default = true) as default_prices,
  COUNT(*) FILTER (WHERE type = 'usage') as usage_type_prices,
  COUNT(*) FILTER (WHERE usage_meter_id IS NOT NULL) as with_usage_meter
FROM prices
WHERE slug LIKE '%_no_charge';

-- 4. Verify every usage meter has a matching no_charge price (should be 0)
SELECT COUNT(*) as meters_missing_no_charge_price
FROM usage_meters um
WHERE NOT EXISTS (
  SELECT 1 FROM prices p
  WHERE p.slug = um.slug || '_no_charge'
  AND p.usage_meter_id = um.id
);

-- 5. Check null priceId events by org (run BEFORE backfill to see what needs fixing)
SELECT
  o.name as organization_name,
  o.id as organization_id,
  COUNT(*) FILTER (WHERE ue.price_id IS NULL) as null_price_events,
  COUNT(*) FILTER (WHERE ue.price_id IS NOT NULL) as non_null_price_events,
  COUNT(*) as total_events
FROM usage_events ue
JOIN customers c ON ue.customer_id = c.id
JOIN organizations o ON c.organization_id = o.id
GROUP BY o.id, o.name
HAVING COUNT(*) FILTER (WHERE ue.price_id IS NULL) > 0
ORDER BY null_price_events DESC;
*/

import { and, eq, isNull } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { Price } from '@/db/schema/prices'
import { usageEvents } from '@/db/schema/usageEvents'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import {
  bulkInsertPrices,
  selectDefaultPriceForUsageMeter,
  selectPriceBySlugAndPricingModelId,
} from '@/db/tableMethods/priceMethods'
import { selectUsageMeters } from '@/db/tableMethods/usageMeterMethods'
import type { CurrencyCode } from '@/types'
import {
  createNoChargePriceInsert,
  getNoChargeSlugForMeter,
} from '@/utils/usage/noChargePriceHelpers'
import runScript from './scriptRunner'

/**
 * SAFETY: Hardcoded local database URL to prevent accidental production runs.
 * This script will ONLY run against this exact URL pattern.
 * Change this when you're ready to run against a cloned/test database.
 */
const LOCAL_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:54322/postgres'

/**
 * Validates that a database URL is safe to run against (local only).
 * Returns true if the URL points to localhost or 127.0.0.1.
 */
function isLocalDatabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1'
    )
  } catch {
    return false
  }
}

/**
 * Asserts that we're running against a local database.
 * Throws an error if not, preventing accidental production runs.
 */
function assertLocalDatabase(url: string): void {
  if (!isLocalDatabaseUrl(url)) {
    throw new Error(
      `🚨 SAFETY CHECK FAILED: This script is only allowed to run against local databases.\n` +
        `Provided URL hostname is not localhost/127.0.0.1.\n` +
        `If you need to run against production, update the script to remove this safety check.`
    )
  }
  // eslint-disable-next-line no-console
  console.log(
    `✅ Safety check passed: Running against local database`
  )
}

interface BackfillStats {
  pricesCreated: number
  pricesSkipped: number
  pricesSetAsDefault: number
  eventsBackfilled: number
}

interface MeterWithNoChargePrice {
  meter: UsageMeter.Record
  noChargePrice: Price.Record
  isNewPrice: boolean
}

/**
 * Backfill no_charge prices for all existing usage meters and update
 * usage events with null priceId to use the no_charge price.
 */
async function backfillNoChargePricesAndUsageEvents(
  db: PostgresJsDatabase
): Promise<void> {
  const stats: BackfillStats = {
    pricesCreated: 0,
    pricesSkipped: 0,
    pricesSetAsDefault: 0,
    eventsBackfilled: 0,
  }

  return await db.transaction(async (tx) => {
    // Step 1: Get all usage meters
    const allUsageMeters = await selectUsageMeters({}, tx)

    // eslint-disable-next-line no-console
    console.log(
      `Found ${allUsageMeters.length} usage meters to process`
    )

    // Step 2: Check which meters need no_charge prices created
    const metersNeedingPrices: UsageMeter.Record[] = []
    const metersWithNoChargePrice: MeterWithNoChargePrice[] = []

    for (const meter of allUsageMeters) {
      const noChargeSlug = getNoChargeSlugForMeter(meter.slug)
      const existingNoChargePrice =
        await selectPriceBySlugAndPricingModelId(
          {
            slug: noChargeSlug,
            pricingModelId: meter.pricingModelId,
          },
          tx
        )

      if (existingNoChargePrice) {
        stats.pricesSkipped++
        // Track for event backfill even though price already exists
        metersWithNoChargePrice.push({
          meter,
          noChargePrice: existingNoChargePrice,
          isNewPrice: false,
        })
      } else {
        metersNeedingPrices.push(meter)
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `${metersNeedingPrices.length} meters need no_charge prices, ${stats.pricesSkipped} already have them`
    )

    // Step 3: Create no_charge prices for meters that need them
    if (metersNeedingPrices.length > 0) {
      // Group meters by organizationId to batch org lookups
      const metersByOrgId = new Map<string, UsageMeter.Record[]>()
      for (const meter of metersNeedingPrices) {
        const existing = metersByOrgId.get(meter.organizationId) ?? []
        existing.push(meter)
        metersByOrgId.set(meter.organizationId, existing)
      }

      // Build price inserts with correct currency from each organization
      const pricesToInsert: Price.UsageInsert[] = []

      for (const [orgId, meters] of metersByOrgId) {
        const organization = await selectOrganizationById(orgId, tx)

        for (const meter of meters) {
          // Check if meter has any existing default price
          const existingDefault =
            await selectDefaultPriceForUsageMeter(meter.id, tx)

          const noChargePriceInsert = createNoChargePriceInsert(
            meter,
            {
              currency: organization.defaultCurrency as CurrencyCode,
            }
          )

          // Set as default only if no other default exists
          if (!existingDefault) {
            noChargePriceInsert.isDefault = true
            stats.pricesSetAsDefault++
          }

          pricesToInsert.push(noChargePriceInsert)
        }
      }

      // Bulk insert all new prices
      const insertedPrices = await bulkInsertPrices(
        pricesToInsert,
        tx
      )
      stats.pricesCreated = insertedPrices.length

      // eslint-disable-next-line no-console
      console.log(`Created ${insertedPrices.length} no_charge prices`)

      // Map inserted prices back to their meters by slug
      const insertedPricesBySlug = new Map(
        insertedPrices.map((p) => [p.slug, p])
      )

      for (const meter of metersNeedingPrices) {
        const noChargeSlug = getNoChargeSlugForMeter(meter.slug)
        const noChargePrice = insertedPricesBySlug.get(noChargeSlug)
        if (noChargePrice) {
          metersWithNoChargePrice.push({
            meter,
            noChargePrice,
            isNewPrice: true,
          })
        }
      }
    }

    // Step 4: Backfill usage events with null priceId
    // eslint-disable-next-line no-console
    console.log(
      `Processing ${metersWithNoChargePrice.length} meters for event backfill`
    )

    for (const { meter, noChargePrice } of metersWithNoChargePrice) {
      // Update all usage events for this meter that have null priceId
      const updatedEvents = await tx
        .update(usageEvents)
        .set({ priceId: noChargePrice.id })
        .where(
          and(
            eq(usageEvents.usageMeterId, meter.id),
            isNull(usageEvents.priceId)
          )
        )
        .returning({ id: usageEvents.id })

      if (updatedEvents.length > 0) {
        stats.eventsBackfilled += updatedEvents.length
        // eslint-disable-next-line no-console
        console.log(
          `Backfilled ${updatedEvents.length} events for meter ${meter.slug}`
        )
      }
    }

    // eslint-disable-next-line no-console
    console.log(`\n=== Backfill Complete ===`)
    // eslint-disable-next-line no-console
    console.log(`Prices created: ${stats.pricesCreated}`)
    // eslint-disable-next-line no-console
    console.log(
      `Prices skipped (already exist): ${stats.pricesSkipped}`
    )
    // eslint-disable-next-line no-console
    console.log(`Prices set as default: ${stats.pricesSetAsDefault}`)
    // eslint-disable-next-line no-console
    console.log(`Usage events backfilled: ${stats.eventsBackfilled}`)
  })
}

// SAFETY: Verify we're running against a local database before proceeding
assertLocalDatabase(LOCAL_DATABASE_URL)

runScript(backfillNoChargePricesAndUsageEvents, {
  databaseUrl: LOCAL_DATABASE_URL,
  skipEnvPull: true, // Don't pull env vars - we're using hardcoded local URL
})
