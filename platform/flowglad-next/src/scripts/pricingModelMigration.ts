/**
 * Pricing Model Migration Script
 *
 * This script migrates organizations to have at most 1 livemode pricing model,
 * enabling a unique partial index on (organization_id, livemode) WHERE livemode = true.
 *
 * ## SAFETY GUARD
 *
 * By default, this script blocks running against real production/staging databases via
 * Vercel env pull. This prevents accidental execution against real databases.
 *
 * ALLOWED (local docker containers):
 *   --db-url="..."    Custom database URL (e.g., local docker)
 *   --staging         Uses STAGING_DATABASE_URL from .env.local (points to localhost)
 *   --prod            Uses PROD_DATABASE_URL from .env.local (points to localhost)
 *
 * BLOCKED (real databases):
 *   NODE_ENV=production/staging without --db-url, --staging, or --prod
 *   (This would pull real credentials from Vercel and connect to real databases)
 *
 * To run against real databases, set SAFETY_GUARD_ENABLED = false below after testing.
 *
 * ## Usage
 *
 * ### Against local docker container (after running `bun run src/scripts/test-migrations.ts --prod --inspect`):
 *   bunx tsx src/scripts/pricingModelMigration.ts --db-url="postgresql://test:test@localhost:5434/test_db"
 *
 * ### Using STAGING_DATABASE_URL / PROD_DATABASE_URL from .env.local (points to localhost):
 *   bunx tsx src/scripts/pricingModelMigration.ts --staging
 *   bunx tsx src/scripts/pricingModelMigration.ts --prod
 *
 * ### [BLOCKED BY SAFETY GUARD] Against real production/staging (via Vercel env pull):
 *   NODE_ENV=production bunx tsx src/scripts/pricingModelMigration.ts
 *   NODE_ENV=staging bunx tsx src/scripts/pricingModelMigration.ts
 *
 * ### Options:
 *   --db-url="..."    Use a custom database URL (highest priority)
 *   --staging         Use STAGING_DATABASE_URL from .env.local (localhost docker)
 *   --prod            Use PROD_DATABASE_URL from .env.local (localhost docker)
 *   --skip-env-pull   Skip pulling environment variables from Vercel
 *
 * ## Migration Strategy
 *
 * The script dynamically discovers PMs that need migration based on:
 * 1. Organizations with multiple livemode PMs
 * 2. For each such org, determines which PM should be the "target" (kept) based on:
 *    - is_default = true, OR
 *    - Has the most customers with Stripe IDs
 * 3. Other PMs in the org are either:
 *    - Moved to testmode (if they have no Stripe-linked data)
 *    - Merged into the target PM (if they have Stripe-linked data)
 *
 * ## Behavioral Decisions
 *
 * 1. CUSTOMER DEDUPLICATION: When source and target PMs have customers with the
 *    same external_id, we ALWAYS keep the target customer record and copy over
 *    the Stripe customer ID from the source (if source has one and target doesn't).
 *    Rationale: Preserves the target PM's data structure while ensuring no Stripe
 *    IDs are lost.
 *
 * 2. PAYMENT METHOD DEDUPLICATION: Same as customers - keep target payment method,
 *    copy over Stripe payment method ID from source if needed.
 *
 * 3. PRODUCT SLUG CONFLICTS: When both source and target PMs have products with
 *    the same slug (e.g., "free"), we merge subscription_items and purchases from
 *    the source product's prices to the target product's corresponding prices,
 *    then delete the source product/prices.
 *
 * 4. DISCOUNT CODE CONFLICTS: When both PMs have discounts with the same code,
 *    keep target discount, reparent all redemptions/references to target.
 *
 * 5. SINGLE TRANSACTION: All migrations run in a single transaction. If ANY
 *    validation fails, the entire transaction is rolled back - no partial changes.
 *
 * ## Phases
 *
 * Phase 1: Move to Testmode - PMs with no Stripe-linked data
 * Phase 2: Simple Merges - Only product slug conflicts (typically "free")
 * Phase 3: Moderate Merges - 1-2 customer conflicts + product conflicts
 * Phase 4: Complex Merges - Many customer/payment method conflicts
 */

/* eslint-disable no-console */

import { loadEnvConfig } from '@next/env'
import { execSync } from 'child_process'
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import {
  drizzle,
  type PostgresJsDatabase,
} from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import core from '@/utils/core'

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * SAFETY GUARD: Set to false to allow running against real databases via Vercel env pull.
 * Only disable this after the script has been thoroughly tested on local docker containers.
 */
const SAFETY_GUARD_ENABLED = true

/**
 * All tables that have a pricing_model_id foreign key and need livemode updated.
 * These are updated when moving a PM to testmode or when reparenting during merges.
 */
const TABLES_WITH_PRICING_MODEL_ID = [
  'billing_period_items',
  'billing_periods',
  'billing_runs',
  'checkout_sessions',
  'customers',
  'discount_redemptions',
  'discounts',
  'features',
  'fee_calculations',
  'invoice_line_items',
  'invoices',
  'ledger_accounts',
  'ledger_entries',
  'ledger_transactions',
  'payment_methods',
  'payments',
  'prices',
  'product_features',
  'products',
  'purchases',
  'refunds',
  'resource_claims',
  'resources',
  'subscription_item_features',
  'subscription_items',
  'subscription_meter_period_calculations',
  'subscriptions',
  'usage_credit_applications',
  'usage_credit_balance_adjustments',
  'usage_credits',
  'usage_events',
  'usage_meters',
] as const

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface PreMigrationState {
  customersWithStripeId: number
  paymentsWithPaymentIntent: number
  paymentsWithChargeId: number
  paymentMethodsWithStripeId: number
  invoicesWithStripeId: number
  checkoutSessionsWithStripeId: number
  subscriptionsWithStripeId: number
  feeCalcsWithTaxCalcId: number
  feeCalcsWithTaxTxnId: number
  orgsWithMultipleLivemodePMs: number
}

interface ValidationResult {
  checkName: string
  passed: boolean
  details: string
  failedRecords?: unknown[]
}

interface MigrationResult {
  pmId: string
  pmName: string
  orgName: string
  action: 'move_to_testmode' | 'merge'
  success: boolean
  recordsUpdated: Record<string, number>
  errors?: string[]
}

interface MigrationSummary {
  preState: PreMigrationState
  plan?: MigrationPlan
  results: MigrationResult[]
  validations: ValidationResult[]
  committed: boolean
  error?: string
}

interface PricingModelInfo {
  id: string
  name: string
  organizationId: string
  orgName: string
  isDefault: boolean
  customersWithStripeId: number
  paymentsWithStripeId: number
  subscriptionsWithStripeId: number
}

interface MergeTarget {
  sourceId: string
  sourceName: string
  targetId: string
  targetName: string
  orgId: string
  orgName: string
  customerConflicts: number
  paymentMethodConflicts: number
  productSlugConflicts: string[]
  discountCodeConflicts: string[]
}

interface MigrationPlan {
  moveToTestmode: PricingModelInfo[]
  merges: MergeTarget[]
}

// ═══════════════════════════════════════════════════════════════════════════
// DISCOVERY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Discovers the current migration state and builds a migration plan.
 * This function queries the database to find all organizations with multiple
 * livemode PMs and determines which PMs should be moved to testmode vs merged.
 */
async function discoverMigrationPlan(
  tx: PostgresJsDatabase
): Promise<MigrationPlan> {
  console.log('\n🔍 Discovering PMs that need migration...')

  // Find all orgs with >1 livemode PM
  const orgsWithMultiplePMs = await tx.execute<{
    organization_id: string
    org_name: string
    pm_count: number
  }>(sql`
    SELECT
      pm.organization_id,
      o.name as org_name,
      COUNT(pm.id) as pm_count
    FROM pricing_models pm
    JOIN organizations o ON o.id = pm.organization_id
    WHERE pm.livemode = true
    GROUP BY pm.organization_id, o.name
    HAVING COUNT(pm.id) > 1
    ORDER BY COUNT(pm.id) DESC
  `)

  console.log(
    `   Found ${orgsWithMultiplePMs.length} orgs with multiple livemode PMs`
  )

  const moveToTestmode: PricingModelInfo[] = []
  const merges: MergeTarget[] = []

  for (const org of orgsWithMultiplePMs) {
    // Get all livemode PMs for this org with their Stripe data counts
    const pmsForOrg = await tx.execute<{
      id: string
      name: string
      is_default: boolean
      customers_with_stripe: number
      payments_with_stripe: number
      subscriptions_with_stripe: number
    }>(sql`
      SELECT
        pm.id,
        pm.name,
        pm.is_default,
        (SELECT COUNT(*) FROM customers c
         WHERE c.pricing_model_id = pm.id
         AND c.stripe_customer_id IS NOT NULL) as customers_with_stripe,
        (SELECT COUNT(*) FROM payments p
         WHERE p.pricing_model_id = pm.id
         AND p.stripe_payment_intent_id IS NOT NULL) as payments_with_stripe,
        (SELECT COUNT(*) FROM subscriptions s
         WHERE s.pricing_model_id = pm.id
         AND s.stripe_setup_intent_id IS NOT NULL) as subscriptions_with_stripe
      FROM pricing_models pm
      WHERE pm.organization_id = ${org.organization_id}
        AND pm.livemode = true
      ORDER BY pm.is_default DESC, customers_with_stripe DESC, pm.created_at ASC
    `)

    const pmInfos: PricingModelInfo[] = pmsForOrg.map(
      (pm: {
        id: string
        name: string
        is_default: boolean
        customers_with_stripe: number
        payments_with_stripe: number
        subscriptions_with_stripe: number
      }) => ({
        id: pm.id,
        name: pm.name,
        organizationId: org.organization_id,
        orgName: org.org_name,
        isDefault: pm.is_default,
        customersWithStripeId: Number(pm.customers_with_stripe),
        paymentsWithStripeId: Number(pm.payments_with_stripe),
        subscriptionsWithStripeId: Number(
          pm.subscriptions_with_stripe
        ),
      })
    )

    // Determine target PM: prefer default, then most customers with Stripe IDs
    const targetPM =
      pmInfos.find((pm) => pm.isDefault) ||
      pmInfos.reduce((best, pm) =>
        pm.customersWithStripeId > best.customersWithStripeId
          ? pm
          : best
      )

    const sourcePMs = pmInfos.filter((pm) => pm.id !== targetPM.id)

    for (const sourcePM of sourcePMs) {
      // Check if source PM has any Stripe-linked data
      const hasStripeData =
        sourcePM.customersWithStripeId > 0 ||
        sourcePM.paymentsWithStripeId > 0 ||
        sourcePM.subscriptionsWithStripeId > 0

      if (!hasStripeData) {
        // No Stripe data - safe to move to testmode
        moveToTestmode.push(sourcePM)
      } else {
        // Has Stripe data - need to merge
        // Analyze conflicts
        const conflicts = await analyzeConflicts(
          tx,
          sourcePM.id,
          targetPM.id
        )
        merges.push({
          sourceId: sourcePM.id,
          sourceName: sourcePM.name,
          targetId: targetPM.id,
          targetName: targetPM.name,
          orgId: org.organization_id,
          orgName: org.org_name,
          ...conflicts,
        })
      }
    }
  }

  console.log(`   PMs to move to testmode: ${moveToTestmode.length}`)
  console.log(`   PMs to merge: ${merges.length}`)

  return { moveToTestmode, merges }
}

/**
 * Analyzes conflicts between source and target PMs for merge operations.
 */
async function analyzeConflicts(
  tx: PostgresJsDatabase,
  sourceId: string,
  targetId: string
): Promise<{
  customerConflicts: number
  paymentMethodConflicts: number
  productSlugConflicts: string[]
  discountCodeConflicts: string[]
}> {
  // Customer conflicts: same external_id in both PMs
  const customerConflicts = await tx.execute<{ count: number }>(sql`
    SELECT COUNT(*) as count
    FROM customers src
    JOIN customers tgt ON src.external_id = tgt.external_id
    WHERE src.pricing_model_id = ${sourceId}
      AND tgt.pricing_model_id = ${targetId}
  `)

  // Payment method conflicts: same external_id (fingerprint) in both PMs
  const paymentMethodConflicts = await tx.execute<{
    count: number
  }>(sql`
    SELECT COUNT(*) as count
    FROM payment_methods src
    JOIN payment_methods tgt ON src.external_id = tgt.external_id
    WHERE src.pricing_model_id = ${sourceId}
      AND tgt.pricing_model_id = ${targetId}
      AND src.external_id IS NOT NULL
  `)

  // Product slug conflicts
  const productConflicts = await tx.execute<{ slug: string }>(sql`
    SELECT DISTINCT src.slug
    FROM products src
    JOIN products tgt ON src.slug = tgt.slug
    WHERE src.pricing_model_id = ${sourceId}
      AND tgt.pricing_model_id = ${targetId}
  `)

  // Discount code conflicts
  const discountConflicts = await tx.execute<{ code: string }>(sql`
    SELECT DISTINCT src.code
    FROM discounts src
    JOIN discounts tgt ON src.code = tgt.code
    WHERE src.pricing_model_id = ${sourceId}
      AND tgt.pricing_model_id = ${targetId}
  `)

  return {
    customerConflicts: Number(customerConflicts[0]?.count || 0),
    paymentMethodConflicts: Number(
      paymentMethodConflicts[0]?.count || 0
    ),
    productSlugConflicts: productConflicts.map(
      (r: { slug: string }) => r.slug
    ),
    discountCodeConflicts: discountConflicts.map(
      (r: { code: string }) => r.code
    ),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Moves a pricing model and all its children to testmode (livemode = false).
 */
async function moveToTestmode(
  tx: PostgresJsDatabase,
  pm: PricingModelInfo
): Promise<MigrationResult> {
  const recordsUpdated: Record<string, number> = {}

  try {
    // Update the PM itself
    await tx.execute(sql`
      UPDATE pricing_models
      SET livemode = false
      WHERE id = ${pm.id}
    `)
    recordsUpdated['pricing_models'] = 1

    // Update all child tables
    for (const table of TABLES_WITH_PRICING_MODEL_ID) {
      const result = await tx.execute(
        sql.raw(`
        UPDATE ${table}
        SET livemode = false
        WHERE pricing_model_id = '${pm.id}'
      `)
      )
      recordsUpdated[table] = Number(result.count || 0)
    }

    return {
      pmId: pm.id,
      pmName: pm.name,
      orgName: pm.orgName,
      action: 'move_to_testmode',
      success: true,
      recordsUpdated,
    }
  } catch (error) {
    return {
      pmId: pm.id,
      pmName: pm.name,
      orgName: pm.orgName,
      action: 'move_to_testmode',
      success: false,
      recordsUpdated,
      errors: [
        error instanceof Error ? error.message : String(error),
      ],
    }
  }
}

/**
 * Merges a source PM into a target PM.
 * Handles customer, payment method, product, and discount deduplication.
 */
async function executeMerge(
  tx: PostgresJsDatabase,
  merge: MergeTarget
): Promise<MigrationResult> {
  const recordsUpdated: Record<string, number> = {}

  try {
    // Step 1: Deduplicate payment methods (must be done before customers)
    if (merge.paymentMethodConflicts > 0) {
      const pmResult = await deduplicatePaymentMethods(
        tx,
        merge.sourceId,
        merge.targetId
      )
      Object.assign(recordsUpdated, pmResult)
    }

    // Step 2: Deduplicate customers
    // Always run deduplication since target PM may have gained customers from earlier merges
    // The function itself queries for current conflicts dynamically
    const custResult = await deduplicateCustomers(
      tx,
      merge.sourceId,
      merge.targetId
    )
    Object.assign(recordsUpdated, custResult)

    // Step 3: Deduplicate products (handle slug conflicts like "free")
    // Re-detect conflicts at execution time since target PM may have gained products from earlier merges
    const currentProductConflicts = await tx.execute<{
      slug: string
    }>(sql`
      SELECT DISTINCT src.slug
      FROM products src
      JOIN products tgt ON src.slug = tgt.slug
      WHERE src.pricing_model_id = ${merge.sourceId}
        AND tgt.pricing_model_id = ${merge.targetId}
    `)
    const currentConflictSlugs = currentProductConflicts.map(
      (r) => r.slug
    )
    if (currentConflictSlugs.length > 0) {
      console.log(
        `      Detected ${currentConflictSlugs.length} product slug conflicts at execution time: ${currentConflictSlugs.join(', ')}`
      )
      const prodResult = await deduplicateProducts(
        tx,
        merge.sourceId,
        merge.targetId,
        currentConflictSlugs
      )
      Object.assign(recordsUpdated, prodResult)
    }

    // Step 4: Deduplicate discounts
    // Re-detect conflicts at execution time since target PM may have gained discounts from earlier merges
    const currentDiscountConflicts = await tx.execute<{
      code: string
    }>(sql`
      SELECT DISTINCT src.code
      FROM discounts src
      JOIN discounts tgt ON src.code = tgt.code
      WHERE src.pricing_model_id = ${merge.sourceId}
        AND tgt.pricing_model_id = ${merge.targetId}
    `)
    const currentConflictCodes = currentDiscountConflicts.map(
      (r) => r.code
    )
    if (currentConflictCodes.length > 0) {
      console.log(
        `      Detected ${currentConflictCodes.length} discount code conflicts at execution time: ${currentConflictCodes.join(', ')}`
      )
      const discResult = await deduplicateDiscounts(
        tx,
        merge.sourceId,
        merge.targetId,
        currentConflictCodes
      )
      Object.assign(recordsUpdated, discResult)
    }

    // Step 5: Reparent all remaining records from source to target
    const reparentResult = await reparentAllRecords(
      tx,
      merge.sourceId,
      merge.targetId
    )
    Object.assign(recordsUpdated, reparentResult)

    // Step 6: Delete the now-empty source PM
    await tx.execute(sql`
      DELETE FROM pricing_models WHERE id = ${merge.sourceId}
    `)
    recordsUpdated['pricing_models_deleted'] = 1

    return {
      pmId: merge.sourceId,
      pmName: merge.sourceName,
      orgName: merge.orgName,
      action: 'merge',
      success: true,
      recordsUpdated,
    }
  } catch (error) {
    return {
      pmId: merge.sourceId,
      pmName: merge.sourceName,
      orgName: merge.orgName,
      action: 'merge',
      success: false,
      recordsUpdated,
      errors: [
        error instanceof Error ? error.message : String(error),
      ],
    }
  }
}

/**
 * Deduplicates payment methods between source and target PMs.
 *
 * BEHAVIORAL DECISION: Always keep the TARGET payment method.
 * If the source has a Stripe payment method ID and target doesn't, copy it over.
 */
async function deduplicatePaymentMethods(
  tx: PostgresJsDatabase,
  sourceId: string,
  targetId: string
): Promise<Record<string, number>> {
  const result: Record<string, number> = {}

  // Find conflicting payment methods (same external_id)
  const conflicts = await tx.execute<{
    source_id: string
    target_id: string
    source_stripe_id: string | null
    target_stripe_id: string | null
  }>(sql`
    SELECT
      src.id as source_id,
      tgt.id as target_id,
      src.stripe_payment_method_id as source_stripe_id,
      tgt.stripe_payment_method_id as target_stripe_id
    FROM payment_methods src
    JOIN payment_methods tgt ON src.external_id = tgt.external_id
    WHERE src.pricing_model_id = ${sourceId}
      AND tgt.pricing_model_id = ${targetId}
      AND src.external_id IS NOT NULL
  `)

  for (const conflict of conflicts) {
    // SAFETY CHECK: If both source and target have different Stripe IDs, we cannot
    // safely merge without losing data. Require manual intervention.
    if (
      conflict.source_stripe_id &&
      conflict.target_stripe_id &&
      conflict.source_stripe_id !== conflict.target_stripe_id
    ) {
      throw new Error(
        `Cannot merge payment methods: both source (${conflict.source_id}) and target (${conflict.target_id}) ` +
          `have different Stripe payment method IDs (source: ${conflict.source_stripe_id}, target: ${conflict.target_stripe_id}). ` +
          `Manual intervention required to resolve this conflict.`
      )
    }

    // Copy Stripe ID from source to target if target is missing it
    if (conflict.source_stripe_id && !conflict.target_stripe_id) {
      await tx.execute(sql`
        UPDATE payment_methods
        SET stripe_payment_method_id = ${conflict.source_stripe_id}
        WHERE id = ${conflict.target_id}
      `)
      result['payment_methods_stripe_id_copied'] =
        (result['payment_methods_stripe_id_copied'] || 0) + 1
    }

    // Update FK references from source payment method to target
    // billing_runs.payment_method_id
    await tx.execute(sql`
      UPDATE billing_runs
      SET payment_method_id = ${conflict.target_id}
      WHERE payment_method_id = ${conflict.source_id}
    `)

    // payments.payment_method_id
    await tx.execute(sql`
      UPDATE payments
      SET payment_method_id = ${conflict.target_id}
      WHERE payment_method_id = ${conflict.source_id}
    `)

    // subscriptions.default_payment_method_id
    await tx.execute(sql`
      UPDATE subscriptions
      SET default_payment_method_id = ${conflict.target_id}
      WHERE default_payment_method_id = ${conflict.source_id}
    `)

    // subscriptions.backup_payment_method_id
    await tx.execute(sql`
      UPDATE subscriptions
      SET backup_payment_method_id = ${conflict.target_id}
      WHERE backup_payment_method_id = ${conflict.source_id}
    `)

    // Delete source payment method
    await tx.execute(sql`
      DELETE FROM payment_methods WHERE id = ${conflict.source_id}
    `)
  }

  result['payment_methods_deduplicated'] = conflicts.length
  return result
}

/**
 * Deduplicates customers between source and target PMs.
 *
 * BEHAVIORAL DECISION: Always keep the TARGET customer.
 * If the source has a Stripe customer ID and target doesn't, copy it over.
 */
async function deduplicateCustomers(
  tx: PostgresJsDatabase,
  sourceId: string,
  targetId: string
): Promise<Record<string, number>> {
  const result: Record<string, number> = {}

  // Find conflicting customers (same external_id)
  const conflicts = await tx.execute<{
    source_id: string
    target_id: string
    source_stripe_id: string | null
    target_stripe_id: string | null
  }>(sql`
    SELECT
      src.id as source_id,
      tgt.id as target_id,
      src.stripe_customer_id as source_stripe_id,
      tgt.stripe_customer_id as target_stripe_id
    FROM customers src
    JOIN customers tgt ON src.external_id = tgt.external_id
    WHERE src.pricing_model_id = ${sourceId}
      AND tgt.pricing_model_id = ${targetId}
  `)

  for (const conflict of conflicts) {
    // SAFETY CHECK: If both source and target have different Stripe IDs, we cannot
    // safely merge without losing data. Require manual intervention.
    if (
      conflict.source_stripe_id &&
      conflict.target_stripe_id &&
      conflict.source_stripe_id !== conflict.target_stripe_id
    ) {
      throw new Error(
        `Cannot merge customers: both source (${conflict.source_id}) and target (${conflict.target_id}) ` +
          `have different Stripe customer IDs (source: ${conflict.source_stripe_id}, target: ${conflict.target_stripe_id}). ` +
          `Manual intervention required to resolve this conflict.`
      )
    }

    // Copy Stripe ID from source to target if target is missing it
    if (conflict.source_stripe_id && !conflict.target_stripe_id) {
      await tx.execute(sql`
        UPDATE customers
        SET stripe_customer_id = ${conflict.source_stripe_id}
        WHERE id = ${conflict.target_id}
      `)
      result['customers_stripe_id_copied'] =
        (result['customers_stripe_id_copied'] || 0) + 1
    }

    // Update FK references from source customer to target
    // Also update pricing_model_id to target PM
    const customerChildTables = [
      'subscriptions',
      'payments',
      'invoices',
      'purchases',
      'checkout_sessions',
      'usage_events',
      'payment_methods',
    ]

    for (const table of customerChildTables) {
      await tx.execute(
        sql.raw(`
        UPDATE ${table}
        SET customer_id = '${conflict.target_id}',
            pricing_model_id = '${targetId}'
        WHERE customer_id = '${conflict.source_id}'
      `)
      )
    }

    // Delete source customer
    await tx.execute(sql`
      DELETE FROM customers WHERE id = ${conflict.source_id}
    `)
  }

  result['customers_deduplicated'] = conflicts.length
  return result
}

/**
 * Deduplicates products with conflicting slugs between source and target PMs.
 * Reparents subscription_items and purchases from source product's prices to target.
 */
async function deduplicateProducts(
  tx: PostgresJsDatabase,
  sourceId: string,
  targetId: string,
  conflictingSlugs: string[]
): Promise<Record<string, number>> {
  const result: Record<string, number> = {}

  for (const slug of conflictingSlugs) {
    // Get source and target products
    const products = await tx.execute<{
      source_product_id: string
      target_product_id: string
    }>(sql`
      SELECT
        src.id as source_product_id,
        tgt.id as target_product_id
      FROM products src
      JOIN products tgt ON src.slug = tgt.slug
      WHERE src.pricing_model_id = ${sourceId}
        AND tgt.pricing_model_id = ${targetId}
        AND src.slug = ${slug}
    `)

    if (products.length === 0) continue

    const { source_product_id, target_product_id } = products[0]

    // Get all prices for both products and map by interval/type for matching
    const sourcePrices = await tx.execute<{
      id: string
      interval_unit: string | null
      type: string
    }>(sql`
      SELECT id, interval_unit, type
      FROM prices
      WHERE product_id = ${source_product_id}
    `)

    const targetPrices = await tx.execute<{
      id: string
      interval_unit: string | null
      type: string
    }>(sql`
      SELECT id, interval_unit, type
      FROM prices
      WHERE product_id = ${target_product_id}
    `)

    // Create a map of target prices by interval_unit+type
    const targetPriceMap = new Map<string, string>()
    for (const tp of targetPrices) {
      const key = `${tp.interval_unit || 'null'}_${tp.type}`
      targetPriceMap.set(key, tp.id)
    }

    // Reparent all tables with price_id FK from source prices to target prices
    for (const sp of sourcePrices) {
      const key = `${sp.interval_unit || 'null'}_${sp.type}`
      let targetPriceId = targetPriceMap.get(key)

      // If no exact match (same interval_unit+type), try to find any target price as fallback
      if (!targetPriceId && targetPrices.length > 0) {
        // Use the first target price as a fallback
        targetPriceId = targetPrices[0].id
        console.log(
          `      ⚠️  No matching target price for ${sp.id} (${sp.interval_unit}/${sp.type}), using fallback ${targetPriceId}`
        )
      }

      if (targetPriceId) {
        // Update subscription_items
        await tx.execute(sql`
          UPDATE subscription_items
          SET price_id = ${targetPriceId},
              pricing_model_id = ${targetId}
          WHERE price_id = ${sp.id}
        `)

        // Update purchases
        await tx.execute(sql`
          UPDATE purchases
          SET price_id = ${targetPriceId},
              pricing_model_id = ${targetId}
          WHERE price_id = ${sp.id}
        `)

        // Update subscriptions (has price_id FK)
        await tx.execute(sql`
          UPDATE subscriptions
          SET price_id = ${targetPriceId},
              pricing_model_id = ${targetId}
          WHERE price_id = ${sp.id}
        `)

        // Update checkout_sessions (has price_id FK, nullable)
        await tx.execute(sql`
          UPDATE checkout_sessions
          SET price_id = ${targetPriceId},
              pricing_model_id = ${targetId}
          WHERE price_id = ${sp.id}
        `)

        // Update fee_calculations (has price_id FK, nullable)
        await tx.execute(sql`
          UPDATE fee_calculations
          SET price_id = ${targetPriceId},
              pricing_model_id = ${targetId}
          WHERE price_id = ${sp.id}
        `)

        // Update invoice_line_items (has price_id FK, nullable)
        await tx.execute(sql`
          UPDATE invoice_line_items
          SET price_id = ${targetPriceId},
              pricing_model_id = ${targetId}
          WHERE price_id = ${sp.id}
        `)

        // Update usage_events (has price_id FK)
        await tx.execute(sql`
          UPDATE usage_events
          SET price_id = ${targetPriceId},
              pricing_model_id = ${targetId}
          WHERE price_id = ${sp.id}
        `)

        // Delete source price (now safe since all FKs have been reparented)
        await tx.execute(sql`
          DELETE FROM prices WHERE id = ${sp.id}
        `)
      } else {
        // No target prices exist at all - check if there are any references to this price
        // that would block deletion (non-nullable FKs)
        const refCounts = await tx.execute<{
          table_name: string
          cnt: number
        }>(
          sql`
          SELECT 'subscriptions' as table_name, COUNT(*)::int as cnt FROM subscriptions WHERE price_id = ${sp.id}
          UNION ALL
          SELECT 'purchases' as table_name, COUNT(*)::int as cnt FROM purchases WHERE price_id = ${sp.id}
          UNION ALL
          SELECT 'usage_events' as table_name, COUNT(*)::int as cnt FROM usage_events WHERE price_id = ${sp.id}
        `
        )

        const blockingRefs = refCounts.filter((r) => r.cnt > 0)
        if (blockingRefs.length > 0) {
          const blocking = blockingRefs
            .map((r) => `${r.table_name}: ${r.cnt}`)
            .join(', ')
          throw new Error(
            `Cannot delete price ${sp.id}: no target price available and has non-nullable FK references (${blocking})`
          )
        }

        // No blocking references - set nullable FKs to NULL and delete
        await tx.execute(sql`
          UPDATE subscription_items SET price_id = NULL WHERE price_id = ${sp.id}
        `)
        await tx.execute(sql`
          UPDATE checkout_sessions SET price_id = NULL WHERE price_id = ${sp.id}
        `)
        await tx.execute(sql`
          UPDATE fee_calculations SET price_id = NULL WHERE price_id = ${sp.id}
        `)
        await tx.execute(sql`
          UPDATE invoice_line_items SET price_id = NULL WHERE price_id = ${sp.id}
        `)

        await tx.execute(sql`
          DELETE FROM prices WHERE id = ${sp.id}
        `)
        console.log(
          `      ℹ️  Deleted orphan price ${sp.id} (no target prices exist)`
        )
      }
    }

    // Delete product_features for source product
    await tx.execute(sql`
      DELETE FROM product_features WHERE product_id = ${source_product_id}
    `)

    // Delete source product
    await tx.execute(sql`
      DELETE FROM products WHERE id = ${source_product_id}
    `)
  }

  result['products_deduplicated'] = conflictingSlugs.length
  return result
}

/**
 * Deduplicates discounts with conflicting codes between source and target PMs.
 */
async function deduplicateDiscounts(
  tx: PostgresJsDatabase,
  sourceId: string,
  targetId: string,
  conflictingCodes: string[]
): Promise<Record<string, number>> {
  const result: Record<string, number> = {}

  for (const code of conflictingCodes) {
    // Get source and target discounts
    const discounts = await tx.execute<{
      source_discount_id: string
      target_discount_id: string
    }>(sql`
      SELECT
        src.id as source_discount_id,
        tgt.id as target_discount_id
      FROM discounts src
      JOIN discounts tgt ON src.code = tgt.code
      WHERE src.pricing_model_id = ${sourceId}
        AND tgt.pricing_model_id = ${targetId}
        AND src.code = ${code}
    `)

    if (discounts.length === 0) continue

    const { source_discount_id, target_discount_id } = discounts[0]

    // Update discount_redemptions
    await tx.execute(sql`
      UPDATE discount_redemptions
      SET discount_id = ${target_discount_id},
          pricing_model_id = ${targetId}
      WHERE discount_id = ${source_discount_id}
    `)

    // Update checkout_sessions
    await tx.execute(sql`
      UPDATE checkout_sessions
      SET discount_id = ${target_discount_id}
      WHERE discount_id = ${source_discount_id}
    `)

    // Update fee_calculations
    await tx.execute(sql`
      UPDATE fee_calculations
      SET discount_id = ${target_discount_id}
      WHERE discount_id = ${source_discount_id}
    `)

    // Delete source discount
    await tx.execute(sql`
      DELETE FROM discounts WHERE id = ${source_discount_id}
    `)
  }

  result['discounts_deduplicated'] = conflictingCodes.length
  return result
}

/**
 * Reparents all remaining records from source PM to target PM.
 * This is called after all deduplication is complete.
 */
async function reparentAllRecords(
  tx: PostgresJsDatabase,
  sourceId: string,
  targetId: string
): Promise<Record<string, number>> {
  const result: Record<string, number> = {}

  for (const table of TABLES_WITH_PRICING_MODEL_ID) {
    // Also set livemode = true since target PM is always livemode during merge
    const updateResult = await tx.execute(
      sql.raw(`
      UPDATE ${table}
      SET pricing_model_id = '${targetId}',
          livemode = true
      WHERE pricing_model_id = '${sourceId}'
    `)
    )
    result[`${table}_reparented`] = Number(updateResult.count || 0)
  }

  return result
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Captures pre-migration state for comparison after migration.
 * NOTE: We count DISTINCT Stripe IDs, not rows. This is because customer deduplication
 * may merge two Flowglad customers that have the same Stripe customer ID (which is valid -
 * they represent the same Stripe customer). In that case, the row count would decrease
 * but no actual Stripe ID value is lost.
 */
async function capturePreMigrationState(
  db: PostgresJsDatabase
): Promise<PreMigrationState> {
  const [
    customersWithStripeId,
    paymentsWithPaymentIntent,
    paymentsWithChargeId,
    paymentMethodsWithStripeId,
    invoicesWithStripeId,
    checkoutSessionsWithStripeId,
    subscriptionsWithStripeId,
    feeCalcsWithTaxCalcId,
    feeCalcsWithTaxTxnId,
    orgsWithMultipleLivemodePMs,
  ] = await Promise.all([
    db.execute<{ count: number }>(
      sql`SELECT COUNT(DISTINCT stripe_customer_id) as count FROM customers WHERE stripe_customer_id IS NOT NULL`
    ),
    db.execute<{ count: number }>(
      sql`SELECT COUNT(DISTINCT stripe_payment_intent_id) as count FROM payments WHERE stripe_payment_intent_id IS NOT NULL`
    ),
    db.execute<{ count: number }>(
      sql`SELECT COUNT(DISTINCT stripe_charge_id) as count FROM payments WHERE stripe_charge_id IS NOT NULL`
    ),
    db.execute<{ count: number }>(
      sql`SELECT COUNT(DISTINCT stripe_payment_method_id) as count FROM payment_methods WHERE stripe_payment_method_id IS NOT NULL`
    ),
    db.execute<{ count: number }>(
      sql`SELECT COUNT(DISTINCT stripe_payment_intent_id) as count FROM invoices WHERE stripe_payment_intent_id IS NOT NULL`
    ),
    db.execute<{ count: number }>(
      sql`SELECT COUNT(DISTINCT stripe_payment_intent_id) as count FROM checkout_sessions WHERE stripe_payment_intent_id IS NOT NULL`
    ),
    db.execute<{ count: number }>(
      sql`SELECT COUNT(DISTINCT stripe_setup_intent_id) as count FROM subscriptions WHERE stripe_setup_intent_id IS NOT NULL`
    ),
    db.execute<{ count: number }>(
      sql`SELECT COUNT(DISTINCT "stripeTaxCalculationId") as count FROM fee_calculations WHERE "stripeTaxCalculationId" IS NOT NULL`
    ),
    db.execute<{ count: number }>(
      sql`SELECT COUNT(DISTINCT "stripeTaxTransactionId") as count FROM fee_calculations WHERE "stripeTaxTransactionId" IS NOT NULL`
    ),
    db.execute<{ count: number }>(sql`
      SELECT COUNT(*) as count FROM (
        SELECT organization_id FROM pricing_models
        WHERE livemode = true
        GROUP BY organization_id HAVING COUNT(*) > 1
      ) t
    `),
  ])

  return {
    customersWithStripeId: Number(customersWithStripeId[0].count),
    paymentsWithPaymentIntent: Number(
      paymentsWithPaymentIntent[0].count
    ),
    paymentsWithChargeId: Number(paymentsWithChargeId[0].count),
    paymentMethodsWithStripeId: Number(
      paymentMethodsWithStripeId[0].count
    ),
    invoicesWithStripeId: Number(invoicesWithStripeId[0].count),
    checkoutSessionsWithStripeId: Number(
      checkoutSessionsWithStripeId[0].count
    ),
    subscriptionsWithStripeId: Number(
      subscriptionsWithStripeId[0].count
    ),
    feeCalcsWithTaxCalcId: Number(feeCalcsWithTaxCalcId[0].count),
    feeCalcsWithTaxTxnId: Number(feeCalcsWithTaxTxnId[0].count),
    orgsWithMultipleLivemodePMs: Number(
      orgsWithMultipleLivemodePMs[0].count
    ),
  }
}

/**
 * Captures Stripe ID counts for validation (can be run inside transaction).
 */
async function captureStripeIdCounts(tx: PostgresJsDatabase) {
  // NOTE: We count DISTINCT Stripe IDs, not rows. This is because customer deduplication
  // may merge two Flowglad customers that have the same Stripe customer ID (which is valid -
  // they represent the same Stripe customer). In that case, the row count would decrease
  // but no actual Stripe ID value is lost.
  const [
    customers,
    paymentsIntent,
    paymentsCharge,
    paymentMethods,
    invoices,
    checkoutSessions,
    subscriptions,
  ] = await Promise.all([
    tx.execute<{ count: number }>(
      sql`SELECT COUNT(DISTINCT stripe_customer_id) as count FROM customers WHERE stripe_customer_id IS NOT NULL`
    ),
    tx.execute<{ count: number }>(
      sql`SELECT COUNT(DISTINCT stripe_payment_intent_id) as count FROM payments WHERE stripe_payment_intent_id IS NOT NULL`
    ),
    tx.execute<{ count: number }>(
      sql`SELECT COUNT(DISTINCT stripe_charge_id) as count FROM payments WHERE stripe_charge_id IS NOT NULL`
    ),
    tx.execute<{ count: number }>(
      sql`SELECT COUNT(DISTINCT stripe_payment_method_id) as count FROM payment_methods WHERE stripe_payment_method_id IS NOT NULL`
    ),
    tx.execute<{ count: number }>(
      sql`SELECT COUNT(DISTINCT stripe_payment_intent_id) as count FROM invoices WHERE stripe_payment_intent_id IS NOT NULL`
    ),
    tx.execute<{ count: number }>(
      sql`SELECT COUNT(DISTINCT stripe_payment_intent_id) as count FROM checkout_sessions WHERE stripe_payment_intent_id IS NOT NULL`
    ),
    tx.execute<{ count: number }>(
      sql`SELECT COUNT(DISTINCT stripe_setup_intent_id) as count FROM subscriptions WHERE stripe_setup_intent_id IS NOT NULL`
    ),
  ])

  return {
    customersWithStripeId: Number(customers[0].count),
    paymentsWithPaymentIntent: Number(paymentsIntent[0].count),
    paymentsWithChargeId: Number(paymentsCharge[0].count),
    paymentMethodsWithStripeId: Number(paymentMethods[0].count),
    invoicesWithStripeId: Number(invoices[0].count),
    checkoutSessionsWithStripeId: Number(checkoutSessions[0].count),
    subscriptionsWithStripeId: Number(subscriptions[0].count),
  }
}

/**
 * Runs all validation checks inside the transaction.
 */
async function runAllValidations(
  tx: PostgresJsDatabase,
  preState: PreMigrationState,
  movedPmIds: string[],
  targetPmIds: string[]
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = []

  // Check 1: Unique constraint - no orgs with >1 livemode PM
  console.log('   Running Check 1: Unique constraint...')
  const uniqueCheck = await tx.execute<{
    organization_id: string
    count: number
  }>(sql`
    SELECT organization_id, COUNT(*) as count
    FROM pricing_models
    WHERE livemode = true
    GROUP BY organization_id
    HAVING COUNT(*) > 1
  `)
  const violatingOrgs = uniqueCheck
  results.push({
    checkName: 'Unique Constraint',
    passed: violatingOrgs.length === 0,
    details:
      violatingOrgs.length === 0
        ? 'No orgs with >1 livemode PM'
        : `${violatingOrgs.length} orgs still have >1 livemode PM`,
    failedRecords:
      violatingOrgs.length > 0 ? violatingOrgs : undefined,
  })

  // Check 2: No orphaned records
  console.log('   Running Check 2: Orphaned records...')
  const orphanedCheck = await tx.execute<{
    tbl: string
    cnt: number
  }>(sql`
    SELECT 'customers' as tbl, COUNT(*) as cnt FROM customers c
      LEFT JOIN pricing_models pm ON c.pricing_model_id = pm.id
      WHERE pm.id IS NULL AND c.pricing_model_id IS NOT NULL
    UNION ALL
    SELECT 'products', COUNT(*) FROM products p
      LEFT JOIN pricing_models pm ON p.pricing_model_id = pm.id
      WHERE pm.id IS NULL AND p.pricing_model_id IS NOT NULL
    UNION ALL
    SELECT 'subscriptions', COUNT(*) FROM subscriptions s
      LEFT JOIN pricing_models pm ON s.pricing_model_id = pm.id
      WHERE pm.id IS NULL AND s.pricing_model_id IS NOT NULL
    UNION ALL
    SELECT 'payments', COUNT(*) FROM payments pay
      LEFT JOIN pricing_models pm ON pay.pricing_model_id = pm.id
      WHERE pm.id IS NULL AND pay.pricing_model_id IS NOT NULL
  `)
  const orphanedRecords = orphanedCheck.filter(
    (r: { tbl: string; cnt: number }) => Number(r.cnt) > 0
  )
  results.push({
    checkName: 'Orphaned Records',
    passed: orphanedRecords.length === 0,
    details:
      orphanedRecords.length === 0
        ? 'No orphaned records found'
        : `Found orphaned records in: ${orphanedRecords.map((r: { tbl: string; cnt: number }) => `${r.tbl}(${r.cnt})`).join(', ')}`,
    failedRecords:
      orphanedRecords.length > 0 ? orphanedRecords : undefined,
  })

  // Check 3A: Moved PMs have livemode = false
  if (movedPmIds.length > 0) {
    console.log(
      '   Running Check 3A: Moved PMs livemode consistency...'
    )
    const movedPmIdList = movedPmIds.map((id) => `'${id}'`).join(',')
    const livemodeCheck = await tx.execute<{
      tbl: string
      cnt: number
    }>(
      sql.raw(`
      SELECT
        'pricing_models' as tbl,
        COUNT(*) as cnt
      FROM pricing_models
      WHERE id IN (${movedPmIdList}) AND livemode = true
      UNION ALL
      SELECT 'customers', COUNT(*) FROM customers
      WHERE pricing_model_id IN (${movedPmIdList}) AND livemode = true
      UNION ALL
      SELECT 'products', COUNT(*) FROM products
      WHERE pricing_model_id IN (${movedPmIdList}) AND livemode = true
      UNION ALL
      SELECT 'subscriptions', COUNT(*) FROM subscriptions
      WHERE pricing_model_id IN (${movedPmIdList}) AND livemode = true
    `)
    )
    const stillLivemode = livemodeCheck.filter(
      (r: { tbl: string; cnt: number }) => Number(r.cnt) > 0
    )
    results.push({
      checkName: 'Moved PMs Livemode=False',
      passed: stillLivemode.length === 0,
      details:
        stillLivemode.length === 0
          ? 'All moved PMs and children have livemode=false'
          : `Records still livemode=true: ${stillLivemode.map((r: { tbl: string; cnt: number }) => `${r.tbl}(${r.cnt})`).join(', ')}`,
      failedRecords:
        stillLivemode.length > 0 ? stillLivemode : undefined,
    })
  }

  // Check 3B: Merged target PMs have livemode = true
  if (targetPmIds.length > 0) {
    console.log(
      '   Running Check 3B: Merged target PMs livemode consistency...'
    )
    const targetPmIdList = targetPmIds
      .map((id) => `'${id}'`)
      .join(',')
    const targetLivemodeCheck = await tx.execute<{
      tbl: string
      cnt: number
    }>(
      sql.raw(`
      SELECT
        'pricing_models' as tbl,
        COUNT(*) as cnt
      FROM pricing_models
      WHERE id IN (${targetPmIdList}) AND livemode = false
      UNION ALL
      SELECT 'customers', COUNT(*) FROM customers
      WHERE pricing_model_id IN (${targetPmIdList}) AND livemode = false
      UNION ALL
      SELECT 'products', COUNT(*) FROM products
      WHERE pricing_model_id IN (${targetPmIdList}) AND livemode = false
    `)
    )
    const wrongTestmode = targetLivemodeCheck.filter(
      (r: { tbl: string; cnt: number }) => Number(r.cnt) > 0
    )
    results.push({
      checkName: 'Merged Target PMs Livemode=True',
      passed: wrongTestmode.length === 0,
      details:
        wrongTestmode.length === 0
          ? 'All merged target PMs and children have livemode=true'
          : `Records wrongly testmode: ${wrongTestmode.map((r: { tbl: string; cnt: number }) => `${r.tbl}(${r.cnt})`).join(', ')}`,
      failedRecords:
        wrongTestmode.length > 0 ? wrongTestmode : undefined,
    })
  }

  // Check 4: Stripe ID preservation (counts should not decrease)
  console.log('   Running Check 4: Stripe ID preservation...')
  const postState = await captureStripeIdCounts(tx)
  const stripeIdChecks = [
    {
      name: 'customers.stripe_customer_id',
      pre: preState.customersWithStripeId,
      post: postState.customersWithStripeId,
    },
    {
      name: 'payments.stripe_payment_intent_id',
      pre: preState.paymentsWithPaymentIntent,
      post: postState.paymentsWithPaymentIntent,
    },
    {
      name: 'payments.stripe_charge_id',
      pre: preState.paymentsWithChargeId,
      post: postState.paymentsWithChargeId,
    },
    {
      name: 'payment_methods.stripe_payment_method_id',
      pre: preState.paymentMethodsWithStripeId,
      post: postState.paymentMethodsWithStripeId,
    },
    {
      name: 'invoices.stripe_payment_intent_id',
      pre: preState.invoicesWithStripeId,
      post: postState.invoicesWithStripeId,
    },
    {
      name: 'checkout_sessions.stripe_payment_intent_id',
      pre: preState.checkoutSessionsWithStripeId,
      post: postState.checkoutSessionsWithStripeId,
    },
    {
      name: 'subscriptions.stripe_setup_intent_id',
      pre: preState.subscriptionsWithStripeId,
      post: postState.subscriptionsWithStripeId,
    },
  ]
  const lostStripeIds = stripeIdChecks.filter((c) => c.post < c.pre)
  results.push({
    checkName: 'Stripe ID Preservation',
    passed: lostStripeIds.length === 0,
    details:
      lostStripeIds.length === 0
        ? 'All Stripe ID counts preserved'
        : `Lost Stripe IDs: ${lostStripeIds.map((c) => `${c.name}: ${c.pre} → ${c.post} (lost ${c.pre - c.post})`).join(', ')}`,
    failedRecords:
      lostStripeIds.length > 0 ? lostStripeIds : undefined,
  })

  // Check 5: FK integrity (no dangling references)
  console.log('   Running Check 5: FK integrity...')
  const fkCheck = await tx.execute<{ rel: string; cnt: number }>(sql`
    SELECT 'subscriptions→customers' as rel, COUNT(*) as cnt
    FROM subscriptions s LEFT JOIN customers c ON s.customer_id = c.id
    WHERE s.customer_id IS NOT NULL AND c.id IS NULL
    UNION ALL
    SELECT 'payments→customers', COUNT(*)
    FROM payments p LEFT JOIN customers c ON p.customer_id = c.id
    WHERE p.customer_id IS NOT NULL AND c.id IS NULL
    UNION ALL
    SELECT 'payments→payment_methods', COUNT(*)
    FROM payments p LEFT JOIN payment_methods pm ON p.payment_method_id = pm.id
    WHERE p.payment_method_id IS NOT NULL AND pm.id IS NULL
    UNION ALL
    SELECT 'subscription_items→prices', COUNT(*)
    FROM subscription_items si LEFT JOIN prices pr ON si.price_id = pr.id
    WHERE si.price_id IS NOT NULL AND pr.id IS NULL
    UNION ALL
    SELECT 'prices→products', COUNT(*)
    FROM prices pr LEFT JOIN products p ON pr.product_id = p.id
    WHERE pr.product_id IS NOT NULL AND p.id IS NULL
  `)
  const danglingRefs = fkCheck.filter(
    (r: { rel: string; cnt: number }) => Number(r.cnt) > 0
  )
  results.push({
    checkName: 'FK Integrity',
    passed: danglingRefs.length === 0,
    details:
      danglingRefs.length === 0
        ? 'No dangling FK references'
        : `Dangling references: ${danglingRefs.map((r: { rel: string; cnt: number }) => `${r.rel}(${r.cnt})`).join(', ')}`,
    failedRecords: danglingRefs.length > 0 ? danglingRefs : undefined,
  })

  return results
}

/**
 * Generates a summary report to the console.
 */
function generateSummaryReport(summary: MigrationSummary): void {
  console.log('\n' + '═'.repeat(60))
  console.log('MIGRATION SUMMARY')
  console.log('═'.repeat(60))

  // Show migration plan first
  if (summary.plan) {
    console.log('\nMigration Plan:')
    console.log(
      `  - PMs to move to testmode: ${summary.plan.moveToTestmode.length}`
    )
    console.log(`  - PMs to merge: ${summary.plan.merges.length}`)

    if (summary.plan.moveToTestmode.length > 0) {
      console.log('\n  Planned Moves to Testmode:')
      // Group by org for cleaner output
      const byOrg = new Map<
        string,
        typeof summary.plan.moveToTestmode
      >()
      for (const pm of summary.plan.moveToTestmode) {
        const key = `${pm.organizationId}|${pm.orgName}`
        if (!byOrg.has(key)) byOrg.set(key, [])
        byOrg.get(key)!.push(pm)
      }
      for (const [key, pms] of byOrg) {
        const [orgId, orgName] = key.split('|')
        console.log(`    Org: ${orgName} (${orgId})`)
        for (const pm of pms) {
          console.log(`      → "${pm.name}" (${pm.id})`)
          console.log(
            `        Stripe data: ${pm.customersWithStripeId} customers, ${pm.paymentsWithStripeId} payments, ${pm.subscriptionsWithStripeId} subscriptions`
          )
        }
      }
    }

    if (summary.plan.merges.length > 0) {
      console.log('\n  Planned Merges:')
      // Group by org for cleaner output
      const byOrg = new Map<string, typeof summary.plan.merges>()
      for (const merge of summary.plan.merges) {
        const key = `${merge.orgId}|${merge.orgName}`
        if (!byOrg.has(key)) byOrg.set(key, [])
        byOrg.get(key)!.push(merge)
      }
      for (const [key, merges] of byOrg) {
        const [orgId, orgName] = key.split('|')
        console.log(`    Org: ${orgName} (${orgId})`)
        for (const merge of merges) {
          console.log(
            `      → Merge "${merge.sourceName}" (${merge.sourceId})`
          )
          console.log(
            `        Into: "${merge.targetName}" (${merge.targetId})`
          )
          console.log(
            `        Conflicts: ${merge.customerConflicts} customers, ${merge.paymentMethodConflicts} payment methods, ${merge.productSlugConflicts.length} products, ${merge.discountCodeConflicts.length} discounts`
          )
        }
      }
    }
  }

  console.log('\n' + '─'.repeat(60))
  console.log(
    `Status: ${summary.committed ? '✅ COMMITTED' : '❌ ROLLED BACK'}`
  )
  if (summary.error) {
    console.log(`Error: ${summary.error}`)
  }
  console.log('\nPre-Migration State:')
  console.log(
    `  - Orgs with >1 livemode PM: ${summary.preState.orgsWithMultipleLivemodePMs}`
  )
  console.log(
    `  - Customers with Stripe ID: ${summary.preState.customersWithStripeId}`
  )
  console.log(
    `  - Payments with Stripe Intent: ${summary.preState.paymentsWithPaymentIntent}`
  )
  console.log(
    `  - Payment Methods with Stripe ID: ${summary.preState.paymentMethodsWithStripeId}`
  )
  console.log(
    `  - Subscriptions with Stripe ID: ${summary.preState.subscriptionsWithStripeId}`
  )

  console.log('\nMigration Results:')
  const moveResults = summary.results.filter(
    (r) => r.action === 'move_to_testmode'
  )
  const mergeResults = summary.results.filter(
    (r) => r.action === 'merge'
  )
  console.log(`  - Moved to testmode: ${moveResults.length}`)
  console.log(
    `    - Successful: ${moveResults.filter((r) => r.success).length}`
  )
  console.log(
    `    - Failed: ${moveResults.filter((r) => !r.success).length}`
  )
  console.log(`  - Merged: ${mergeResults.length}`)
  console.log(
    `    - Successful: ${mergeResults.filter((r) => r.success).length}`
  )
  console.log(
    `    - Failed: ${mergeResults.filter((r) => !r.success).length}`
  )

  // Show detailed breakdown of affected PMs
  if (moveResults.length > 0) {
    console.log('\n  PMs Moved to Testmode:')
    for (const r of moveResults) {
      const status = r.success ? '✅' : '❌'
      console.log(
        `    ${status} "${r.pmName}" (${r.pmId}) - Org: ${r.orgName}`
      )
      if (!r.success && r.errors) {
        for (const err of r.errors) {
          console.log(`       Error: ${err}`)
        }
      }
    }
  }

  if (mergeResults.length > 0) {
    console.log('\n  PMs Merged:')
    for (const r of mergeResults) {
      const status = r.success ? '✅' : '❌'
      console.log(
        `    ${status} "${r.pmName}" (${r.pmId}) - Org: ${r.orgName}`
      )
      if (r.success && Object.keys(r.recordsUpdated).length > 0) {
        const updates = Object.entries(r.recordsUpdated)
          .filter(([_, count]) => count > 0)
          .map(([table, count]) => `${table}: ${count}`)
          .join(', ')
        if (updates) {
          console.log(`       Records updated: ${updates}`)
        }
      }
      if (!r.success && r.errors) {
        for (const err of r.errors) {
          console.log(`       Error: ${err}`)
        }
      }
    }
  }

  console.log('\nValidation Results:')
  for (const v of summary.validations) {
    console.log(
      `  - ${v.checkName}: ${v.passed ? '✅ PASS' : '❌ FAIL'} - ${v.details}`
    )
  }
  console.log('═'.repeat(60))
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

async function runMigration(
  db: PostgresJsDatabase
): Promise<MigrationSummary> {
  const summary: MigrationSummary = {
    preState: {} as PreMigrationState,
    results: [],
    validations: [],
    committed: false,
  }

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Capture pre-migration state (OUTSIDE transaction)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('📊 Step 1: Capturing pre-migration state...')
    summary.preState = await capturePreMigrationState(db)
    console.log(
      `   Pre-state captured: ${summary.preState.orgsWithMultipleLivemodePMs} orgs with multiple livemode PMs`
    )
    console.log(
      `   Customers with Stripe IDs: ${summary.preState.customersWithStripeId}`
    )

    if (summary.preState.orgsWithMultipleLivemodePMs === 0) {
      console.log(
        '\n✅ No orgs with multiple livemode PMs found. Nothing to migrate.'
      )
      summary.committed = true
      return summary
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2-5: Execute everything in a single transaction
    // ─────────────────────────────────────────────────────────────────────────
    await db.transaction(async (tx) => {
      // ───────────────────────────────────────────────────────────────────────
      // STEP 2: Build migration plan dynamically
      // ───────────────────────────────────────────────────────────────────────
      console.log('\n🔍 Step 2: Building migration plan...')
      const migrationPlan = await discoverMigrationPlan(tx)
      summary.plan = migrationPlan

      if (
        migrationPlan.moveToTestmode.length === 0 &&
        migrationPlan.merges.length === 0
      ) {
        console.log('\n✅ No PMs need migration.')
        summary.committed = true
        return
      }

      // ───────────────────────────────────────────────────────────────────────
      // STEP 3: Execute migrations
      // ───────────────────────────────────────────────────────────────────────
      console.log('\n🚀 Step 3: Executing migrations...')

      // Phase 1: Move PMs to testmode
      if (migrationPlan.moveToTestmode.length > 0) {
        console.log(
          `\n   Phase 1: Moving ${migrationPlan.moveToTestmode.length} PMs to testmode...`
        )
        for (const pm of migrationPlan.moveToTestmode) {
          const result = await moveToTestmode(tx, pm)
          summary.results.push(result)
          if (!result.success) {
            throw new Error(
              `Failed to move PM ${pm.id} to testmode: ${result.errors?.join(', ')}`
            )
          }
          console.log(
            `   ✓ Moved "${pm.name}" (${pm.id}) from ${pm.orgName}`
          )
        }
      }

      // Phase 2-4: Execute merges (sorted by complexity)
      if (migrationPlan.merges.length > 0) {
        // Sort by complexity: simple (no customer conflicts) first
        const sortedMerges = [...migrationPlan.merges].sort(
          (a, b) => {
            const aComplexity =
              a.customerConflicts + a.paymentMethodConflicts
            const bComplexity =
              b.customerConflicts + b.paymentMethodConflicts
            return aComplexity - bComplexity
          }
        )

        console.log(
          `\n   Phases 2-4: Executing ${sortedMerges.length} merges...`
        )
        for (const merge of sortedMerges) {
          const complexity =
            merge.customerConflicts > 10
              ? 'Complex'
              : merge.customerConflicts > 0
                ? 'Moderate'
                : 'Simple'
          console.log(
            `   [${complexity}] Merging "${merge.sourceName}" → "${merge.targetName}" (${merge.orgName})`
          )
          console.log(
            `      Conflicts: ${merge.customerConflicts} customers, ${merge.paymentMethodConflicts} payment methods, ${merge.productSlugConflicts.length} product slugs`
          )

          const result = await executeMerge(tx, merge)
          summary.results.push(result)
          if (!result.success) {
            throw new Error(
              `Failed to merge PM ${merge.sourceId} into ${merge.targetId}: ${result.errors?.join(', ')}`
            )
          }
          console.log(`   ✓ Merged successfully`)
        }
      }

      // ───────────────────────────────────────────────────────────────────────
      // STEP 4: Run validation checks
      // ───────────────────────────────────────────────────────────────────────
      console.log('\n🔎 Step 4: Running validation checks...')

      const movedPmIds = migrationPlan.moveToTestmode.map(
        (pm) => pm.id
      )
      const targetPmIds = [
        ...new Set(migrationPlan.merges.map((m) => m.targetId)),
      ]

      summary.validations = await runAllValidations(
        tx,
        summary.preState,
        movedPmIds,
        targetPmIds
      )

      // Check if all validations passed
      const failedValidations = summary.validations.filter(
        (v) => !v.passed
      )

      if (failedValidations.length > 0) {
        console.log('\n❌ VALIDATION FAILURES:')
        for (const failed of failedValidations) {
          console.log(`   - ${failed.checkName}: ${failed.details}`)
          if (failed.failedRecords) {
            console.log(
              `     Records: ${JSON.stringify(failed.failedRecords, null, 2)}`
            )
          }
        }

        // Throw error to trigger rollback
        throw new Error(
          `${failedValidations.length} validation(s) failed:\n` +
            failedValidations
              .map((v) => `  - ${v.checkName}: ${v.details}`)
              .join('\n')
        )
      }

      console.log('\n✅ All validations passed!')

      // ───────────────────────────────────────────────────────────────────────
      // STEP 5: Transaction will be committed
      // ───────────────────────────────────────────────────────────────────────
      summary.committed = true
      console.log('\n💾 Committing transaction...')
    })

    console.log('\n🎉 Migration completed successfully!')
  } catch (error) {
    // Transaction was rolled back
    summary.committed = false
    summary.error =
      error instanceof Error ? error.message : String(error)
    console.log('\n⚠️  Migration rolled back:', summary.error)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 6: Generate summary report
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n📝 Step 6: Generating summary report...')
  generateSummaryReport(summary)

  return summary
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRIPT RUNNER
// ═══════════════════════════════════════════════════════════════════════════

function pullDevelopmentEnvVars() {
  execSync(`vercel env pull .env.local`, {
    stdio: 'inherit',
  })
  execSync('bun run postvercel:env-pull', {
    stdio: 'inherit',
  })
  console.info(
    '📥 Successfully pulled development environment variables'
  )
}

function rmDevelopmentEnvVars() {
  execSync('bun run vercel:env-rm', {
    stdio: 'inherit',
  })
}

async function main() {
  const args = process.argv.slice(2)
  const skipEnvPull = args.includes('--skip-env-pull')
  const useStaging = args.includes('--staging')
  const useProd = args.includes('--prod')
  const dbUrlArg = args.find((arg) => arg.startsWith('--db-url='))
  const customDbUrl = dbUrlArg?.split('=').slice(1).join('=') // Handle URLs with = in them

  const env = process.env.NODE_ENV ?? 'development'

  console.log('\n' + '═'.repeat(60))
  console.log('PRICING MODEL MIGRATION SCRIPT')
  console.log('═'.repeat(60))
  console.log(`Environment: ${env}`)
  console.log(`Skip env pull: ${skipEnvPull}`)
  console.log(`Use staging clone URL: ${useStaging}`)
  console.log(`Use prod clone URL: ${useProd}`)
  console.log(
    `Custom DB URL: ${customDbUrl ? 'provided' : 'not provided'}`
  )
  console.log('═'.repeat(60) + '\n')

  // Validate mutually exclusive options
  if (useStaging && useProd) {
    console.error('❌ Cannot use both --staging and --prod flags')
    process.exit(1)
  }

  // SAFETY GUARD: Block Vercel env pull path (which connects to real databases)
  const wouldUseVercelEnvPull =
    !customDbUrl && !useStaging && !useProd
  if (SAFETY_GUARD_ENABLED && wouldUseVercelEnvPull) {
    console.error('═'.repeat(60))
    console.error(
      '❌ SAFETY GUARD: Running against real databases is blocked.'
    )
    console.error('═'.repeat(60))
    console.error('')
    console.error(
      'This script is currently configured to only run against local docker containers.'
    )
    console.error(
      'This prevents accidental execution against production or staging databases.'
    )
    console.error('')
    console.error('ALLOWED OPTIONS:')
    console.error(
      '  --db-url="postgresql://test:test@localhost:5434/test_db"'
    )
    console.error(
      '  --staging  (uses STAGING_DATABASE_URL from .env.local, points to localhost)'
    )
    console.error(
      '  --prod     (uses PROD_DATABASE_URL from .env.local, points to localhost)'
    )
    console.error('')
    console.error('To run against real databases after testing:')
    console.error(
      '  Set SAFETY_GUARD_ENABLED = false in pricingModelMigration.ts'
    )
    console.error('')
    process.exit(1)
  }

  let dbUrl: string

  if (customDbUrl) {
    // Priority 1: Use custom database URL (e.g., for local docker container)
    dbUrl = customDbUrl
    console.log(`Using custom database URL from --db-url flag`)
  } else if (useStaging || useProd) {
    // Priority 2: Use STAGING_DATABASE_URL or PROD_DATABASE_URL from .env.local
    // Load environment variables from .env.local
    const projectDir = process.cwd()
    loadEnvConfig(projectDir)

    const envVarName = useStaging
      ? 'STAGING_DATABASE_URL'
      : 'PROD_DATABASE_URL'
    const envDbUrl = process.env[envVarName]

    if (!envDbUrl) {
      console.error(
        `❌ ${envVarName} is not set.\n` +
          'Please set it in your environment or .env.local file.\n' +
          'You can find it in your Supabase dashboard under Settings > Database > Connection string.\n' +
          'Or run: vercel env pull'
      )
      process.exit(1)
    }

    dbUrl = envDbUrl
    console.log(`Using ${envVarName} from environment`)
  } else {
    // Priority 3: Use Vercel environment variables
    try {
      if (!skipEnvPull) {
        rmDevelopmentEnvVars()
        execSync(`vercel env pull --environment=${env}`, {
          stdio: 'inherit',
        })
        console.info(
          `📥 Successfully ran vercel env pull command for ${env}`
        )
      } else {
        console.info('⏩ Skipping environment pull as requested')
      }
    } catch (error) {
      console.error(
        `❌ Error running vercel env pull command for ${env}:`,
        error
      )
      if (!skipEnvPull) {
        pullDevelopmentEnvVars()
      }
      process.exit(1)
    }

    const projectDir = process.cwd()
    loadEnvConfig(projectDir)
    dbUrl = core.envVariable('DATABASE_URL')
  }

  // Determine if we should restore env vars after completion
  // Only restore if we did a Vercel env pull (i.e., not using --db-url, --staging, or --prod)
  const shouldRestoreEnv =
    !customDbUrl && !useStaging && !useProd && !skipEnvPull

  // Connect to database
  const client = postgres(dbUrl, {
    max: 15,
    idle_timeout: 5,
    prepare: false,
  })
  const db = drizzle(client, { logger: true })

  try {
    const summary = await runMigration(db)

    // Cleanup: pull dev env vars back if we pulled prod/staging via Vercel
    if (shouldRestoreEnv) {
      pullDevelopmentEnvVars()
    }

    // Exit with appropriate code
    if (summary.committed) {
      console.log('\n✅ Migration completed and committed.')
      process.exit(0)
    } else {
      console.log('\n❌ Migration failed and was rolled back.')
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Fatal error:', error)
    if (shouldRestoreEnv) {
      pullDevelopmentEnvVars()
    }
    process.exit(1)
  }
}

main()
