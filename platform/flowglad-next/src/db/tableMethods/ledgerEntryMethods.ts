import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  whereClauseFromObject,
  createBulkInsertFunction,
} from '@/db/tableUtils'
import {
  ledgerEntries,
  ledgerEntriesInsertSchema,
  ledgerEntriesSelectSchema,
  ledgerEntriesUpdateSchema,
  LedgerEntry,
} from '@/db/schema/ledgerEntries'
import { DbTransaction } from '../types'
import {
  CurrencyCode,
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  UsageBillingInfo,
} from '@/types'
import { and, asc, eq, gt, inArray, lt, not, or } from 'drizzle-orm'
import { createDateNotPassedFilter } from '../tableUtils'
import { selectUsageCredits } from './usageCreditMethods'
import { BillingRun } from '../schema/billingRuns'
import core from '@/utils/core'
import {
  UsageMeterBalance,
  usageMeters,
  usageMetersClientSelectSchema,
  usageMetersSelectSchema,
} from '../schema/usageMeters'
import { usageEvents } from '../schema/usageEvents'
import { prices } from '../schema/prices'
import { billingPeriodItems } from '../schema/billingPeriodItems'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

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
  const result = await transaction
    .select()
    .from(ledgerEntries)
    .where(
      and(
        whereClauseFromObject(ledgerEntries, scopedWhere),
        createDateNotPassedFilter(ledgerEntries.discardedAt),
        balanceTypeWhereStatement(balanceType)
      )
    )
    .orderBy(asc(ledgerEntries.position))
  return balanceFromEntries(
    result.map((item) => ledgerEntriesSelectSchema.parse(item))
  )
}

/**
 * Fetches and calculates usage meter balances for subscriptions.
 * This function:
 * 1. Retrieves all relevant ledger entries for the given subscriptions
 * 2. Groups entries by ledger account to calculate balances
 * 3. Returns the balances along with their associated usage meters
 *
 * The function only considers entries that:
 * - Match the provided subscription/ledger account filters
 * - Are relevant for "available" balance calculation (posted or pending debits)
 * - Have not been discarded
 *
 * @param scopedWhere - Filter conditions for subscription and ledger account
 * @param transaction - Database transaction to use
 * @param calculationDate - Date to use for balance calculations (defaults to current date)
 * @returns Array of usage meter balances with their subscription IDs
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
  // Step 1: Fetch ledger entries with their associated usage meters
  // Uses INNER JOIN to only get entries with valid usage meters
  const entries = await transaction
    .select({
      ledgerEntry: ledgerEntries,
      usageMeter: usageMeters,
    })
    .from(ledgerEntries)
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

  // Step 2: Group entries by ledger account for balance calculation
  // This allows us to calculate the total balance for each account
  const entriesByAccount = core.groupBy(
    (item) => item.ledgerEntry.ledgerAccountId,
    entries.map((item) => ({
      usageMeter: usageMetersSelectSchema.parse(item.usageMeter),
      ledgerEntry: ledgerEntriesSelectSchema.parse(item.ledgerEntry),
    }))
  )

  // Step 3: Calculate balances for each account
  // Returns the usage meter balance along with its subscription ID
  return Object.values(entriesByAccount).map((accountEntries) => {
    const firstEntry = accountEntries[0]
    const balance = balanceFromEntries(
      accountEntries.map((item) => item.ledgerEntry)
    )

    return {
      usageMeterBalance: {
        ...usageMetersClientSelectSchema.parse(firstEntry.usageMeter),
        subscriptionId: firstEntry.ledgerEntry.subscriptionId!,
        availableBalance: balance,
      },
      subscriptionId: firstEntry.ledgerEntry.subscriptionId!,
    }
  })
}

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
  // First, fetch all ledger entries that match the scopedWhere criteria (e.g., ledgerAccountId)
  // and are relevant for an "available" balance calculation (posted, or pending debits, and not discarded).
  const ledgerEntryRecords = await transaction
    .select()
    .from(ledgerEntries)
    .where(
      and(
        whereClauseFromObject(ledgerEntries, scopedWhere),
        balanceTypeWhereStatement('available'),
        createDateNotPassedFilter(
          ledgerEntries.discardedAt,
          calculationDate
        ),
        // This entry type is a credit, but it doesn't credit the *usage credit balance*.
        // It credits the usage cost that is being offset by the credit application.
        // Therefore, we must exclude it from the balance calculation for the usage credit itself.
        not(
          eq(
            ledgerEntries.entryType,
            LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost
          )
        )
      )
    )
    .orderBy(asc(ledgerEntries.position))

  // Group the fetched ledger entries by their sourceUsageCreditId.
  // Ledger entries without a sourceUsageCreditId are ignored.
  const entriesByUsageCreditId = new Map<
    string,
    LedgerEntry.Record[]
  >()
  ledgerEntryRecords.forEach((rawEntry) => {
    // Ensure raw database records are parsed into the correct TypeScript type.
    const entry = ledgerEntriesSelectSchema.parse(rawEntry)
    const usageCreditId = entry.sourceUsageCreditId
    if (!usageCreditId) {
      return
    }
    if (!entriesByUsageCreditId.has(usageCreditId)) {
      entriesByUsageCreditId.set(usageCreditId, [])
    }
    entriesByUsageCreditId.get(usageCreditId)?.push(entry)
  })

  // If no ledger entries were found that are associated with any usage credit, return an empty array.
  if (entriesByUsageCreditId.size === 0) {
    return []
  }

  // Collect all unique sourceUsageCreditIds from the ledger entries found.
  // This is necessary to fetch the corresponding UsageCredit records, including their expiresAt dates.
  const allFoundSourceUsageCreditIds = Array.from(
    entriesByUsageCreditId.keys()
  )

  // Fetch the UsageCredit records for all the unique sourceUsageCreditIds identified from the ledger entries.
  const relevantUsageCredits = await selectUsageCredits(
    {
      id: allFoundSourceUsageCreditIds,
    },
    transaction
  )

  // Create a map from usageCreditId to its expiresAt date (which can be null).
  // This allows efficient lookup of expiry dates when calculating the final balances.
  const expiresAtByUsageCreditId = new Map<string, number | null>()
  relevantUsageCredits.forEach((usageCredit) => {
    expiresAtByUsageCreditId.set(
      usageCredit.id,
      usageCredit.expiresAt
    )
  })

  // Calculate the balance for each usageCreditId and combine it with its expiry date.
  const balances = Array.from(entriesByUsageCreditId.entries()).map(
    ([usageCreditId, entriesForThisCredit]) => {
      return {
        usageCreditId,
        balance: balanceFromEntries(entriesForThisCredit),
        // All entries for a given usage credit should belong to the same ledger account.
        ledgerAccountId: entriesForThisCredit[0].ledgerAccountId,
        // Retrieve the expiresAt date from the map, defaulting to null if not found (though it should always be found here).
        expiresAt:
          expiresAtByUsageCreditId.get(usageCreditId) ?? null,
      }
    }
  )
  return balances
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
  // TODO: group by usagemeterid, priceid, and sum up balances (be careful about direction)
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
  // This should be true since usage events can only be created for usage prices
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

  // entriesByUsageMeterIdAndPriceId
  // iterate thru entriesByUsageEventId
  // get the usage meter id and price id from the usage event from priceInfoByUsageEventId
  const entriesByUsageMeterIdAndPriceId = new Map<
    string,
    LedgerEntry.Record[]
  >()
  Object.entries(entriesByUsageEventId).forEach(
    ([usageEventId, entries]) => {
      const priceInfo = priceInfoByUsageEventId.get(usageEventId)
      if (!priceInfo) {
        throw new Error(
          `Price information not found for usage event ${usageEventId}`
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
      const omitFields = ['usageEventIds', 'description']
      const normalize = (obj: any) =>
        JSON.stringify(
          shallowOmit(obj, omitFields),
          Object.keys(shallowOmit(obj, omitFields)).sort()
        )

      const existingItem = priceInfoByUsageMeterIdAndPriceId.get(key)
      if (existingItem) {
        if (normalize(existingItem) !== normalize(item)) {
          throw new Error(
            `Existing and current item for ${key} have different values (excluding usageEventIds): \nexisting: ${JSON.stringify(existingItem)} vs \ncurrent: ${JSON.stringify(item)}`
          )
        }
        existingItem.usageEventIds.push(event.usageEventId)
        existingItem.description += `, ${event.usageEventId}`
      }
    }
  })

  // const balances = Array.from(entriesByUsageEventId.entries()).map(
  const balances: UsageBillingInfo[] = Array.from(
    entriesByUsageMeterIdAndPriceId.entries()
  ).map(([usageMeterIdPriceId, entries]) => {
    // try use priceInfoByUsageMeterIdAndPriceId
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
      // usageEventId: usageEventIdAndPriceId,
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
