import { and, asc, eq, inArray, lt, not, or, sql } from 'drizzle-orm'
import {
  type LedgerEntry,
  ledgerEntries,
  ledgerEntriesInsertSchema,
  ledgerEntriesSelectSchema,
  ledgerEntriesUpdateSchema,
} from '@/db/schema/ledgerEntries'
import {
  createBulkInsertFunction,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
  whereClauseFromObject,
} from '@/db/tableUtils'
import {
  type CurrencyCode,
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  type UsageBillingInfo,
} from '@/types'
import core from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import type { BillingRun } from '../schema/billingRuns'
import { prices } from '../schema/prices'
import { usageCredits } from '../schema/usageCredits'
import { usageEvents } from '../schema/usageEvents'
import {
  type UsageMeterBalance,
  usageMeters,
  usageMetersClientSelectSchema,
  usageMetersSelectSchema,
} from '../schema/usageMeters'
import { createDateNotPassedFilter } from '../tableUtils'
import type { DbTransaction } from '../types'
import {
  derivePricingModelIdFromSubscription,
  pricingModelIdsForSubscriptions,
} from './subscriptionMethods'
import {
  derivePricingModelIdFromUsageMeter,
  pricingModelIdsForUsageMeters,
} from './usageMeterMethods'

const config: ORMMethodCreatorConfig<
  typeof ledgerEntries,
  typeof ledgerEntriesSelectSchema,
  typeof ledgerEntriesInsertSchema,
  typeof ledgerEntriesUpdateSchema
> = {
  selectSchema: ledgerEntriesSelectSchema,
  insertSchema: ledgerEntriesInsertSchema,
  updateSchema: ledgerEntriesUpdateSchema,
  tableName: 'usage_ledger_items',
}

export const selectLedgerEntryById = createSelectById(
  ledgerEntries,
  config
)

/**
 * Derives pricingModelId for a ledger entry with COALESCE logic.
 * Priority: subscription > usageMeter
 * Used for ledger entry inserts.
 */
export const derivePricingModelIdForLedgerEntry = async (
  data: {
    subscriptionId?: string | null
    usageMeterId?: string | null
  },
  transaction: DbTransaction
): Promise<string> => {
  // Try subscription first
  if (data.subscriptionId) {
    try {
      return await derivePricingModelIdFromSubscription(
        data.subscriptionId,
        transaction
      )
    } catch (error) {
      // Only fall through when the subscription exists but lacks a pricingModelId.
      if (
        error instanceof Error &&
        error.message.includes('does not have a pricingModelId')
      ) {
        // fall through to usage meter if provided
      } else {
        // subscription is missing or some other error occurred – rethrow
        throw error
      }
    }
  }

  // Try usage meter second
  if (data.usageMeterId) {
    try {
      return await derivePricingModelIdFromUsageMeter(
        data.usageMeterId,
        transaction
      )
    } catch (error) {
      // For usage meters we don't have another fallback – surface the real error.
      throw error
    }
  }

  throw new Error(
    'Cannot derive pricingModelId: subscriptionId and usageMeterId are both null or missing pricingModelId'
  )
}

const baseInsertLedgerEntry = createInsertFunction(
  ledgerEntries,
  config
)

export const insertLedgerEntry = async (
  ledgerEntryInsert: LedgerEntry.Insert,
  transaction: DbTransaction
): Promise<LedgerEntry.Record> => {
  const pricingModelId = ledgerEntryInsert.pricingModelId
    ? ledgerEntryInsert.pricingModelId
    : await derivePricingModelIdForLedgerEntry(
        {
          subscriptionId: ledgerEntryInsert.subscriptionId,
          usageMeterId: ledgerEntryInsert.usageMeterId,
        },
        transaction
      )
  return baseInsertLedgerEntry(
    {
      ...ledgerEntryInsert,
      pricingModelId,
    },
    transaction
  )
}

export const updateLedgerEntry = createUpdateFunction(
  ledgerEntries,
  config
)

export const selectLedgerEntries = createSelectFunction(
  ledgerEntries,
  config
)

const baseBulkInsertLedgerEntries = createBulkInsertFunction(
  ledgerEntries,
  config
)

export const bulkInsertLedgerEntries = async (
  ledgerEntryInserts: LedgerEntry.Insert[],
  transaction: DbTransaction
): Promise<LedgerEntry.Record[]> => {
  // Collect all unique subscription and usage meter IDs
  const subscriptionIds = Array.from(
    new Set(
      ledgerEntryInserts
        .map((insert) => insert.subscriptionId)
        .filter((id): id is string => !!id)
    )
  )
  const usageMeterIds = Array.from(
    new Set(
      ledgerEntryInserts
        .map((insert) => insert.usageMeterId)
        .filter((id): id is string => !!id)
    )
  )

  // Batch fetch pricingModelIds
  const subscriptionPricingModelIdMap =
    await pricingModelIdsForSubscriptions(
      subscriptionIds,
      transaction
    )
  const usageMeterPricingModelIdMap =
    await pricingModelIdsForUsageMeters(usageMeterIds, transaction)

  // Derive pricingModelId for each insert
  const ledgerEntriesWithPricingModelId = ledgerEntryInserts.map(
    (ledgerEntryInsert): LedgerEntry.Insert => {
      if (ledgerEntryInsert.pricingModelId) {
        return ledgerEntryInsert
      }

      // If we have a subscriptionId, we expect it to resolve in the batch map.
      if (ledgerEntryInsert.subscriptionId) {
        const subscriptionPricingModelId =
          subscriptionPricingModelIdMap.get(
            ledgerEntryInsert.subscriptionId
          )

        if (!subscriptionPricingModelId) {
          throw new Error(
            `Cannot derive pricingModelId: subscription ${ledgerEntryInsert.subscriptionId} not found or missing pricingModelId`
          )
        }

        return {
          ...ledgerEntryInsert,
          pricingModelId: subscriptionPricingModelId,
        }
      }

      // Otherwise fall back to usage meter if provided.
      if (ledgerEntryInsert.usageMeterId) {
        const usageMeterPricingModelId =
          usageMeterPricingModelIdMap.get(
            ledgerEntryInsert.usageMeterId
          )

        if (!usageMeterPricingModelId) {
          throw new Error(
            `Cannot derive pricingModelId: usage meter ${ledgerEntryInsert.usageMeterId} not found or missing pricingModelId`
          )
        }

        return {
          ...ledgerEntryInsert,
          pricingModelId: usageMeterPricingModelId,
        }
      }

      // No subscriptionId and no usageMeterId – nothing to derive from.
      throw new Error(
        'Cannot derive pricingModelId: subscriptionId and usageMeterId are both null or missing pricingModelId'
      )
    }
  )

  return baseBulkInsertLedgerEntries(
    ledgerEntriesWithPricingModelId,
    transaction
  )
}

const balanceTypeWhereStatement = (
  balanceType: 'pending' | 'posted' | 'available'
) => {
  switch (balanceType) {
    case 'posted':
      return eq(ledgerEntries.status, LedgerEntryStatus.Posted)
    case 'pending':
      return inArray(ledgerEntries.status, [
        LedgerEntryStatus.Pending,
        LedgerEntryStatus.Posted,
      ])
    case 'available':
      /**
       * include both posted OR
       * pending + debit
       * (exclude pending + credit)
       */
      return or(
        eq(ledgerEntries.status, LedgerEntryStatus.Posted),
        and(
          eq(ledgerEntries.status, LedgerEntryStatus.Pending),
          eq(ledgerEntries.direction, LedgerEntryDirection.Debit)
        )
      )
  }
}

export const balanceFromEntries = (entries: LedgerEntry.Record[]) => {
  return entries.reduce((acc, entry) => {
    return entry.direction === LedgerEntryDirection.Credit
      ? acc + entry.amount
      : acc - entry.amount
  }, 0)
}

/**
 * Aggregates the signed ledger balance for an account directly in SQL.
 * The query filters entries according to the provided scope, applies the
 * appropriate balance type rules, and sums credits minus debits so only a
 * single aggregated value is returned from the database.
 *
 * @param scopedWhere - Partial ledger entry filters scoped to a ledger account
 * @param balanceType - Determines which ledger entries contribute to the sum
 * @param transaction - Database transaction used to execute the aggregation
 * @returns The aggregated balance for the scoped ledger account
 */
export const aggregateBalanceForLedgerAccountFromEntries = async (
  scopedWhere: Pick<
    LedgerEntry.Where,
    | 'ledgerAccountId'
    | 'status'
    | 'sourceBillingPeriodCalculationId'
    | 'sourceCreditApplicationId'
    | 'sourceCreditBalanceAdjustmentId'
    | 'sourceUsageEventId'
    | 'sourceUsageCreditId'
    | 'sourceCreditApplicationId'
  >,
  balanceType: 'pending' | 'posted' | 'available',
  transaction: DbTransaction
) => {
  // CASE statement computes signed amounts where credits add and debits subtract.
  const balanceExpression = sql<number>`
    SUM(
      CASE 
        WHEN ${ledgerEntries.direction} = ${LedgerEntryDirection.Credit}
        THEN ${ledgerEntries.amount}
        ELSE -${ledgerEntries.amount}
      END
    )
  `

  // Execute the aggregation against ledger entries using scoped filters.
  const result = await transaction
    .select({
      balance: balanceExpression,
    })
    .from(ledgerEntries)
    .where(
      and(
        whereClauseFromObject(ledgerEntries, scopedWhere),
        createDateNotPassedFilter(ledgerEntries.discardedAt),
        balanceTypeWhereStatement(balanceType)
      )
    )

  // Convert the aggregated SQL result into a numeric balance (default to zero).
  return parseInt(`${result[0]?.balance ?? 0}`, 10)
}

/**
 * Aggregates usage meter balances for subscriptions directly in SQL.
 * The query filters ledger entries by subscription/account scope, enforces the
 * "available" balance rules, and joins the usage meter metadata so that the
 * database returns one summarized row per meter rather than every individual entry.
 *
 * @param scopedWhere - Subscription and ledger account filters to apply
 * @param transaction - Database transaction used to execute the aggregation
 * @param calculationDate - Anchor date for discard filtering (defaults to now)
 * @returns Usage meters with their computed available balances per subscription
 */
export const selectUsageMeterBalancesForSubscriptions = async (
  scopedWhere: Pick<
    LedgerEntry.Where,
    'subscriptionId' | 'ledgerAccountId'
  >,
  transaction: DbTransaction,
  calculationDate: Date = new Date()
): Promise<
  { usageMeterBalance: UsageMeterBalance; subscriptionId: string }[]
> => {
  // Build a CASE/SUM expression that treats credits as positive and debits as negative.
  const balanceExpression = sql<number>`
    SUM(
      CASE
        WHEN ${ledgerEntries.direction} = ${LedgerEntryDirection.Credit}
        THEN ${ledgerEntries.amount}
        ELSE -${ledgerEntries.amount}
      END
    )
  `

  // Run the aggregation inside the database so only summarized balances are returned.
  const results = await transaction
    .select({
      ledgerAccountId: ledgerEntries.ledgerAccountId,
      subscriptionId: ledgerEntries.subscriptionId,
      usageMeter: usageMeters,
      balance: balanceExpression,
    })
    .from(ledgerEntries)
    // Join usage meter metadata so each aggregate row includes the related meter.
    .innerJoin(
      usageMeters,
      eq(ledgerEntries.usageMeterId, usageMeters.id)
    )
    .where(
      and(
        whereClauseFromObject(ledgerEntries, scopedWhere),
        balanceTypeWhereStatement('available'),
        createDateNotPassedFilter(
          ledgerEntries.discardedAt,
          calculationDate
        )
      )
    )
    .groupBy(
      // Group by all non-aggregated columns required by SQL.
      ledgerEntries.ledgerAccountId,
      ledgerEntries.subscriptionId,
      usageMeters.id,
      usageMeters.organizationId,
      usageMeters.name,
      usageMeters.pricingModelId,
      usageMeters.slug,
      usageMeters.aggregationType,
      usageMeters.createdAt,
      usageMeters.updatedAt,
      usageMeters.createdByCommit,
      usageMeters.updatedByCommit,
      usageMeters.livemode,
      usageMeters.position
    )

  // Transform the aggregated rows into the expected usage meter balance shape.
  return results
    .filter((result) => Boolean(result.subscriptionId))
    .map((result) => {
      // Parse the raw usage meter row with server-side schema validation.
      const usageMeterRecord = usageMetersSelectSchema.parse(
        result.usageMeter
      )

      // Normalize the balance coming back from SQL (strings) into a number.
      const availableBalance = parseInt(`${result.balance ?? 0}`, 10)

      // Convert the usage meter to its client-facing schema.
      const usageMeterClientRecord =
        usageMetersClientSelectSchema.parse(usageMeterRecord)

      // Return the usage meter balance with the computed available balance.
      return {
        usageMeterBalance: {
          ...usageMeterClientRecord,
          subscriptionId: result.subscriptionId!,
          availableBalance,
        },
        subscriptionId: result.subscriptionId!,
      }
    })
}

/**
 * Optimized version of aggregateAvailableBalanceForUsageCredit that performs
 * aggregation in SQL rather than in memory.
 *
 * This version significantly reduces database egress costs by:
 * 1. Grouping and summing ledger entries directly in the database
 * 2. Joining with usage_credits to get expiresAt in a single query
 * 3. Only transferring aggregated results instead of all individual entries
 *
 */
export const aggregateAvailableBalanceForUsageCredit = async (
  scopedWhere: Pick<
    LedgerEntry.Where,
    'ledgerAccountId' | 'sourceUsageCreditId'
  >,
  transaction: DbTransaction,
  calculationDate: Date = new Date()
): Promise<
  {
    usageCreditId: string
    ledgerAccountId: string
    balance: number
    expiresAt: number | null
  }[]
> => {
  // Build the conditional sum expression for calculating balance
  // Credit entries add to balance, debit entries subtract from balance
  const balanceExpression = sql<number>`
    SUM(
      CASE 
        WHEN ${ledgerEntries.direction} = ${LedgerEntryDirection.Credit} 
        THEN ${ledgerEntries.amount}
        ELSE -${ledgerEntries.amount}
      END
    )
  `

  // Perform the aggregation directly in SQL with a single query
  const results = await transaction
    .select({
      usageCreditId: ledgerEntries.sourceUsageCreditId,
      ledgerAccountId: ledgerEntries.ledgerAccountId,
      balance: balanceExpression,
      expiresAt: usageCredits.expiresAt,
    })
    .from(ledgerEntries)
    .innerJoin(
      usageCredits,
      eq(ledgerEntries.sourceUsageCreditId, usageCredits.id)
    )
    .where(
      and(
        whereClauseFromObject(ledgerEntries, scopedWhere),
        balanceTypeWhereStatement('available'),
        createDateNotPassedFilter(
          ledgerEntries.discardedAt,
          calculationDate
        ),
        // Exclude credit applications that credit usage costs
        // (these don't affect the usage credit balance itself)
        not(
          eq(
            ledgerEntries.entryType,
            LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost
          )
        )
      )
    )
    .groupBy(
      ledgerEntries.sourceUsageCreditId,
      ledgerEntries.ledgerAccountId,
      usageCredits.expiresAt
    )

  // Transform results to match the expected return type
  return results
    .filter((result) => result.usageCreditId !== null)
    .map((result) => ({
      usageCreditId: result.usageCreditId!,
      ledgerAccountId: result.ledgerAccountId,
      /**
       * raw SQL result is a string, so we need to parse it to a number
       */
      balance: parseInt(`${result.balance ?? 0}`, 10),
      expiresAt: result.expiresAt
        ? new Date(result.expiresAt).getTime()
        : null,
    }))
}

export const aggregateOutstandingBalanceForUsageCosts = async (
  scopedWhere: Pick<
    LedgerEntry.Where,
    'ledgerAccountId' | 'sourceUsageEventId' | 'claimedByBillingRunId'
  >,
  anchorDate: Date | number,
  transaction: DbTransaction
): Promise<UsageBillingInfo[]> => {
  const result = await transaction
    .select()
    .from(ledgerEntries)
    .where(
      and(
        and(
          whereClauseFromObject(ledgerEntries, scopedWhere),
          inArray(ledgerEntries.entryType, [
            LedgerEntryType.UsageCost,
            LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost,
          ])
        ),
        balanceTypeWhereStatement('posted'),
        createDateNotPassedFilter(ledgerEntries.discardedAt),
        createDateNotPassedFilter(
          ledgerEntries.expiredAt,
          anchorDate
        ),
        lt(
          ledgerEntries.entryTimestamp,
          new Date(anchorDate).getTime()
        )
      )
    )
    .orderBy(asc(ledgerEntries.position))

  const entriesByUsageEventId = new Map<
    string,
    LedgerEntry.Record[]
  >()
  result.forEach((item) => {
    const usageEventId = item.sourceUsageEventId
    if (!usageEventId) {
      return
    }
    if (!entriesByUsageEventId.has(usageEventId)) {
      entriesByUsageEventId.set(usageEventId, [])
    }
    entriesByUsageEventId
      .get(usageEventId)
      ?.push(ledgerEntriesSelectSchema.parse(item))
  })

  /**
   * Assumptions to test:
   * 1. Each usageCreditId will be unique
   * 2. Expires at will match the usageCreditId
   * 3. LedgerAccountId will match the ledger account implied by the usage credit id
   */

  // Fetch usage events with their associated prices
  const usageEventIds = Array.from(entriesByUsageEventId.keys())
  if (usageEventIds.length === 0) {
    return []
  }

  /**
   * Usage events can be created with or without a priceId:
   * - With priceId: Events created with priceId or priceSlug specified
   * - Without priceId (null): Events created with usageMeterId or usageMeterSlug specified (no price)
   *
   * We use LEFT JOIN instead of INNER JOIN to include events without prices.
   * This allows us to aggregate usage costs even when no price was specified at event creation time.
   */
  const usageEventsWithPrices = await transaction
    .select({
      usageEventId: usageEvents.id,
      priceId: usageEvents.priceId,
      usageEventsPerUnit: prices.usageEventsPerUnit,
      unitPrice: prices.unitPrice,
      livemode: usageEvents.livemode,
      usageMeterName: usageMeters.name,
      currency: prices.currency,
      usageMeterId: usageMeters.id,
    })
    .from(usageEvents)
    .innerJoin(
      usageMeters,
      eq(usageEvents.usageMeterId, usageMeters.id)
    )
    // LEFT JOIN allows events without prices (priceId is null)
    .leftJoin(prices, eq(usageEvents.priceId, prices.id))
    .where(inArray(usageEvents.id, usageEventIds))

  // Type for usage events with validated price info
  // For events without prices (priceId is null), we use default values
  type ValidatedUsageEventWithPrice = {
    usageEventId: string
    priceId: string | null
    usageEventsPerUnit: number
    unitPrice: number
    livemode: boolean
    usageMeterName: string
    currency: string | null
    usageMeterId: string
  }

  const validatedUsageEventsWithPrices: ValidatedUsageEventWithPrice[] =
    usageEventsWithPrices.map((event) => {
      /**
       * For events without prices, we apply default values:
       * - unitPrice: 0 (no per-unit cost since no price was specified)
       * - usageEventsPerUnit: 1 (treat each event as 1 unit for aggregation purposes)
       * - currency: null (no currency context without a price)
       */
      if (event.priceId === null) {
        return {
          usageEventId: event.usageEventId,
          priceId: null,
          usageEventsPerUnit: 1, // Default to 1 for events without prices
          unitPrice: 0, // Events without prices have $0 cost
          livemode: event.livemode,
          usageMeterName: event.usageMeterName,
          currency: null, // No currency for events without prices
          usageMeterId: event.usageMeterId,
        }
      }
      // For events with prices, validate that it's a usage price
      if (event.usageEventsPerUnit === null) {
        throw new Error(
          `Usage event ${event.usageEventId} references price ${event.priceId}, but the price was not found or is not a usage price (has null usageEventsPerUnit).`
        )
      }
      if (event.unitPrice === null) {
        throw new Error(
          `Usage event ${event.usageEventId} is associated with price ${event.priceId} which has null unitPrice.`
        )
      }
      return {
        usageEventId: event.usageEventId,
        priceId: event.priceId,
        usageEventsPerUnit: event.usageEventsPerUnit,
        unitPrice: event.unitPrice,
        livemode: event.livemode,
        usageMeterName: event.usageMeterName,
        currency: event.currency,
        usageMeterId: event.usageMeterId,
      }
    })

  const priceInfoByUsageEventId = new Map(
    validatedUsageEventsWithPrices.map((item) => {
      // For events without prices, use a simple name without currency formatting
      const name =
        item.priceId === null
          ? `Usage: ${item.usageMeterName} (no price)`
          : `Usage: ${item.usageMeterName} at ${stripeCurrencyAmountToHumanReadableCurrencyAmount(item.currency as CurrencyCode, item.unitPrice)} per ${item.usageEventsPerUnit}`

      return [
        item.usageEventId,
        {
          usageMeterId: item.usageMeterId,
          priceId: item.priceId,
          usageEventsPerUnit: item.usageEventsPerUnit,
          unitPrice: item.unitPrice,
          livemode: item.livemode,
          name,
          description: `usageEventId: ${item.usageEventId}, priceId: ${item.priceId}, usageEventsPerUnit: ${item.usageEventsPerUnit}, unitPrice: ${item.unitPrice}`,
        },
      ] as const
    })
  )

  /**
   * Group ledger entries by (usageMeterId, priceId) for invoice line item aggregation.
   *
   * Key format: `${usageMeterId}-${priceId}`
   * - For events with prices: `${usageMeterId}-${actualPriceId}`
   * - For events without prices: `${usageMeterId}-null` (template string converts null to "null")
   *
   * This grouping ensures:
   * 1. Events with the same price are grouped together (for invoice display)
   * 2. Events without prices are grouped separately by usage meter
   * 3. The string "null" in the key is safe because priceIds are nanoids (never the literal string "null")
   */
  const entriesByUsageMeterIdAndPriceId = new Map<
    string,
    LedgerEntry.Record[]
  >()
  Array.from(entriesByUsageEventId.entries()).forEach(
    ([usageEventId, entries]) => {
      const priceInfo = priceInfoByUsageEventId.get(usageEventId)
      if (!priceInfo) {
        throw new Error(
          `Price information not found for usage event ${usageEventId}`
        )
      }
      // Template string converts null to "null", which is safe since priceIds are never the literal string "null"
      const key = `${priceInfo.usageMeterId}-${priceInfo.priceId}`

      if (!entriesByUsageMeterIdAndPriceId.has(key)) {
        entriesByUsageMeterIdAndPriceId.set(key, [])
      }
      ;(entries as LedgerEntry.Record[]).forEach(
        (item: LedgerEntry.Record) => {
          entriesByUsageMeterIdAndPriceId.get(key)?.push(item)
        }
      )
    }
  )
  const priceInfoByUsageMeterIdAndPriceId = new Map<
    string,
    {
      usageMeterId: string
      priceId: string | null
      usageEventsPerUnit: number
      unitPrice: number
      livemode: boolean
      name: string
      description: string
      usageEventIds: string[]
    }
  >()
  validatedUsageEventsWithPrices.forEach((event) => {
    // Template string converts null to "null", which is safe since priceIds are nanoids (never the literal string "null")
    const key = `${event.usageMeterId}-${event.priceId}`

    // For events without prices, use a simple name without currency formatting
    const name =
      event.priceId === null
        ? `Usage: ${event.usageMeterName} (no price)`
        : `Usage: ${event.usageMeterName} at ${stripeCurrencyAmountToHumanReadableCurrencyAmount(event.currency as CurrencyCode, event.unitPrice)} per ${event.usageEventsPerUnit}`

    const item = {
      usageMeterId: event.usageMeterId,
      priceId: event.priceId,
      usageEventsPerUnit: event.usageEventsPerUnit,
      unitPrice: event.unitPrice,
      livemode: event.livemode,
      name,
      description: `priceId: ${event.priceId}, usageMeterId: ${event.usageMeterId}, usageEventsPerUnit: ${event.usageEventsPerUnit}, unitPrice: ${event.unitPrice}, usageEventIds: ${event.usageEventId}`,
      usageEventIds: [event.usageEventId],
    }
    if (!priceInfoByUsageMeterIdAndPriceId.has(key)) {
      priceInfoByUsageMeterIdAndPriceId.set(key, item)
    } else {
      // we omit ['usageEventIds', 'description'] first before comparison
      // because those fields get appended to the priceInfoByUsageMeterIdAndPriceId item
      // as we encounter more usage event entries with the same (usage meter id, price id).
      // so we have a list of usageEventIds for each (usage meter id, price id) for auditability
      const omitFields = ['usageEventIds', 'description']
      const normalize = (obj: any) => {
        const omitted = core.omit(omitFields, obj)
        return JSON.stringify(omitted, Object.keys(omitted).sort())
      }

      const existingItem = priceInfoByUsageMeterIdAndPriceId.get(key)
      if (existingItem) {
        if (normalize(existingItem) !== normalize(item)) {
          throw new Error(
            `Existing and current item for ${key} have different values (excluding usageEventIds and description): \nexisting: ${JSON.stringify(existingItem)} vs \ncurrent: ${JSON.stringify(item)}`
          )
        }
        existingItem.usageEventIds.push(event.usageEventId)
        existingItem.description += `, ${event.usageEventId}`
      }
    }
  })

  const balances: UsageBillingInfo[] = Array.from(
    entriesByUsageMeterIdAndPriceId.entries()
  ).map(([usageMeterIdPriceId, entries]) => {
    const priceInfo = priceInfoByUsageMeterIdAndPriceId.get(
      usageMeterIdPriceId
    )
    if (!priceInfo) {
      throw new Error(
        `Price information not found for usageMeterIdAndPriceId ${usageMeterIdPriceId}`
      )
    }
    return {
      usageMeterIdPriceId,
      balance: balanceFromEntries(entries) * -1,
      ledgerAccountId: entries[0].ledgerAccountId,
      usageMeterId: entries[0].usageMeterId!,
      priceId: priceInfo.priceId,
      usageEventsPerUnit: priceInfo.usageEventsPerUnit,
      unitPrice: priceInfo.unitPrice,
      livemode: priceInfo.livemode,
      name: priceInfo.name,
      description: priceInfo.description,
      usageEventIds: priceInfo.usageEventIds,
    }
  })
  return balances
}

export const claimLedgerEntriesWithOutstandingBalances = async (
  usageEventIds: string[],
  billingRun: BillingRun.Record,
  transaction: DbTransaction
): Promise<LedgerEntry.Record[]> => {
  if (usageEventIds.length === 0) {
    return []
  }
  const ledgerEntryResults = await selectLedgerEntries(
    {
      sourceUsageEventId: usageEventIds,
      entryType: LedgerEntryType.UsageCost,
    },
    transaction
  )
  if (ledgerEntryResults.length !== usageEventIds.length) {
    throw new Error(
      `Some ledger entries were not found: ${usageEventIds.join(', ')}`
    )
  }
  ledgerEntryResults.forEach((entry) => {
    if (entry.entryType !== LedgerEntryType.UsageCost) {
      throw new Error(
        `Ledger entry ${entry.id} is not a usage cost. Can only claim usage costs`
      )
    }
    if (entry.subscriptionId !== billingRun.subscriptionId) {
      throw new Error(
        `Ledger entry ${entry.id} is not associated with the billing run. Can only claim usage costs for the billing run`
      )
    }
  })
  const updatedLedgerEntries = await transaction
    .update(ledgerEntries)
    .set({
      claimedByBillingRunId: billingRun.id,
    })
    .where(
      and(
        inArray(ledgerEntries.sourceUsageEventId, usageEventIds),
        eq(ledgerEntries.entryType, LedgerEntryType.UsageCost)
      )
    )
  return updatedLedgerEntries.map((entry) =>
    ledgerEntriesSelectSchema.parse(entry)
  )
}
