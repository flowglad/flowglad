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

export const insertLedgerEntry = createInsertFunction(
  ledgerEntries,
  config
)

export const updateLedgerEntry = createUpdateFunction(
  ledgerEntries,
  config
)

export const selectLedgerEntries = createSelectFunction(
  ledgerEntries,
  config
)

export const bulkInsertLedgerEntries = createBulkInsertFunction(
  ledgerEntries,
  config
)

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
    .innerJoin(prices, eq(usageEvents.priceId, prices.id))
    .where(inArray(usageEvents.id, usageEventIds))

  // To avoid downstream type issue with usageEventsPerUnit
  // Validate that all prices are usage prices (usageEventsPerUnit must be non-null)
  type ValidatedUsageEventWithPrice = Omit<
    (typeof usageEventsWithPrices)[number],
    'usageEventsPerUnit'
  > & {
    usageEventsPerUnit: number
  }

  const validatedUsageEventsWithPrices: ValidatedUsageEventWithPrice[] =
    usageEventsWithPrices.map((event) => {
      if (event.usageEventsPerUnit === null) {
        throw new Error(
          `Usage event ${event.usageEventId} is associated with price ${event.priceId} which has null usageEventsPerUnit. Usage events must be associated with usage prices.`
        )
      }
      return {
        ...event,
        usageEventsPerUnit: event.usageEventsPerUnit,
      }
    })

  const priceInfoByUsageEventId = new Map(
    validatedUsageEventsWithPrices.map((item) => [
      item.usageEventId,
      {
        usageMeterId: item.usageMeterId,
        priceId: item.priceId,
        usageEventsPerUnit: item.usageEventsPerUnit,
        unitPrice: item.unitPrice,
        livemode: item.livemode,
        name:
          'Usage: ' +
          item.usageMeterName +
          ` at ${stripeCurrencyAmountToHumanReadableCurrencyAmount(item.currency as CurrencyCode, item.unitPrice)} per ${item.usageEventsPerUnit}`,
        description: `usageEventId: ${item.usageEventId}, priceId: ${item.priceId}, usageEventsPerUnit: ${item.usageEventsPerUnit}, unitPrice: ${item.unitPrice}`,
      },
    ])
  )

  // Group by usage meter id and price id for invoice
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
      // FIXME: Handle nullable priceId - usage events can now have null priceId
      if (!priceInfo.priceId) {
        throw new Error(
          `Usage event ${usageEventId} has null priceId. Handling of events without prices is not yet implemented.`
        )
      }
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
      priceId: string
      usageEventsPerUnit: number
      unitPrice: number
      livemode: boolean
      name: string
      description: string
      usageEventIds: string[]
    }
  >()
  validatedUsageEventsWithPrices.forEach((event) => {
    // FIXME: Handle nullable priceId - usage events can now have null priceId
    if (!event.priceId) {
      // Skip events without prices for now
      return
    }
    const key = `${event.usageMeterId}-${event.priceId}`
    const item = {
      usageMeterId: event.usageMeterId,
      priceId: event.priceId,
      usageEventsPerUnit: event.usageEventsPerUnit,
      unitPrice: event.unitPrice,
      livemode: event.livemode,
      name:
        'Usage: ' +
        event.usageMeterName +
        ` at ${stripeCurrencyAmountToHumanReadableCurrencyAmount(event.currency as CurrencyCode, event.unitPrice)} per ${event.usageEventsPerUnit}`,
      description: `priceId: ${event.priceId}, usageMeterId: ${event.usageMeterId}, usageEventsPerUnit: ${event.usageEventsPerUnit}, unitPrice: ${event.unitPrice}, usageEventIds: ${event.usageEventId}`,
      usageEventIds: [event.usageEventId],
    }
    if (!priceInfoByUsageMeterIdAndPriceId.has(key)) {
      priceInfoByUsageMeterIdAndPriceId.set(key, item)
    } else {
      const shallowOmit = (obj: any, fields: string[]) => {
        const clone = { ...obj }
        for (const field of fields) {
          delete clone[field]
        }
        return clone
      }
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
