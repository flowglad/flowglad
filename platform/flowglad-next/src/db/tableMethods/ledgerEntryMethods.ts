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
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
} from '@/types'
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  not,
  or,
} from 'drizzle-orm'
import { LedgerTransaction } from '../schema/ledgerTransactions'
import { selectUsageCredits } from './usageCreditMethods'
import { selectUsageEvents } from './usageEventMethods'
import { BillingRun } from '../schema/billingRuns'
import core from '@/utils/core'
import {
  UsageMeter,
  UsageMeterBalance,
  usageMeterBalanceClientSelectSchema,
  usageMeters,
  usageMetersSelectSchema,
} from '../schema/usageMeters'

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

const discardedAtFilterOutStatement = (
  calculationDate: Date = new Date()
) => {
  return or(
    isNull(ledgerEntries.discardedAt),
    gt(ledgerEntries.discardedAt, calculationDate)
  )
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
        discardedAtFilterOutStatement(),
        balanceTypeWhereStatement(balanceType)
      )
    )
    .orderBy(asc(ledgerEntries.position))
  return balanceFromEntries(
    result.map((item) => ledgerEntriesSelectSchema.parse(item))
  )
}

/**
 * Note: the return is unique by subscriptionId x usageMeter
 * A customer may very well have multiple subscriptions, each with their own accounts tracking the same usage meter
 * @param scopedWhere
 * @param transaction
 * @param calculationDate
 * @returns
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
  // First, fetch all ledger entries that match the scopedWhere criteria (e.g., ledgerAccountId)
  // and are relevant for an "available" balance calculation (posted, or pending debits, and not discarded).
  const result = await transaction
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
        discardedAtFilterOutStatement(calculationDate)
      )
    )
  const resultsByLedgerAccountId: Record<
    string,
    {
      usageMeter: UsageMeter.Record
      ledgerEntry: LedgerEntry.Record
    }[]
  > = core.groupBy(
    (item) => item.ledgerEntry.ledgerAccountId,
    result.map((item) => ({
      usageMeter: usageMetersSelectSchema.parse(item.usageMeter),
      ledgerEntry: ledgerEntriesSelectSchema.parse(item.ledgerEntry),
    }))
  )

  const usageMeterBalanceAndSubscriptionIds = Object.values(
    resultsByLedgerAccountId
  ).map((items) => {
    const balance = balanceFromEntries(
      items.map((item) =>
        ledgerEntriesSelectSchema.parse(item.ledgerEntry)
      )
    )
    const usageMeterBalance: UsageMeterBalance = {
      ...usageMeterBalanceClientSelectSchema.parse(
        items[0].usageMeter
      ),
      availableBalance: balance,
    }
    const normalizedObject: {
      usageMeterBalance: UsageMeterBalance
      subscriptionId: string
    } = {
      usageMeterBalance,
      subscriptionId: items[0].ledgerEntry.subscriptionId!,
    }
    return normalizedObject
  })
  return usageMeterBalanceAndSubscriptionIds
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
    expiresAt: Date | null
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
        discardedAtFilterOutStatement(calculationDate),
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
  const expiresAtByUsageCreditId = new Map<string, Date | null>()
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
  anchorDate: Date,
  transaction: DbTransaction
): Promise<
  {
    usageEventId: string
    usageMeterId: string
    ledgerAccountId: string
    balance: number
  }[]
> => {
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
        discardedAtFilterOutStatement(),
        or(
          gt(ledgerEntries.expiredAt, anchorDate),
          isNull(ledgerEntries.expiredAt)
        ),
        lt(ledgerEntries.entryTimestamp, anchorDate)
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
  const balances = Array.from(entriesByUsageEventId.entries()).map(
    ([usageEventId, entries]) => {
      return {
        usageEventId,
        balance: balanceFromEntries(entries) * -1,
        ledgerAccountId: entries[0].ledgerAccountId,
        usageMeterId: entries[0].usageMeterId!,
      }
    }
  )
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
