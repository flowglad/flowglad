import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  whereClauseFromObject,
} from '@/db/tableUtils'
import {
  ledgerEntries,
  ledgerEntriesInsertSchema,
  ledgerEntriesSelectSchema,
  ledgerEntriesUpdateSchema,
  LedgerEntry,
} from '@/db/schema/ledgerEntries'
import { DbTransaction } from '../types'
import { LedgerEntryDirection, LedgerEntryStatus } from '@/types'
import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import { LedgerTransaction } from '../schema/ledgerTransactions'
import { selectUsageCredits } from './usageCreditMethods'
import { selectUsageEvents } from './usageEventMethods'

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

export const bulkInsertLedgerEntries = async (
  data: Array<typeof ledgerEntries.$inferInsert>,
  transaction: DbTransaction
) => {
  if (data.length === 0) {
    return []
  }
  // Assuming ledgerEntriesInsertSchema can validate an array, or we validate each item if needed.
  // For simplicity, direct insert is used here. Validation should occur before calling this.
  return transaction.insert(ledgerEntries).values(data).returning()
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

const discardedAtFilterOutStatement = () => {
  return or(
    isNull(ledgerEntries.discardedAt),
    gt(ledgerEntries.discardedAt, new Date())
  )
}

const balanceFromEntries = (entries: LedgerEntry.Record[]) => {
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
  return balanceFromEntries(
    result.map((item) => ledgerEntriesSelectSchema.parse(item))
  )
}

const usageCreditsFromLedgerEntryWhere = (
  scopedWhere: Pick<LedgerEntry.Where, 'sourceUsageCreditId'>,
  transaction: DbTransaction
) => {
  if (!scopedWhere.sourceUsageCreditId) {
    return []
  }
  if (typeof scopedWhere.sourceUsageCreditId === 'string') {
    return selectUsageCredits(
      {
        id: scopedWhere.sourceUsageCreditId,
      },
      transaction
    )
  }
  const definedUsageCreditIds =
    scopedWhere.sourceUsageCreditId.filter(
      (id): id is string => id !== null
    )
  if (definedUsageCreditIds.length === 0) {
    return []
  }
  return selectUsageCredits(
    {
      id: definedUsageCreditIds,
    },
    transaction
  )
}

export const aggregateAvailableBalanceForUsageCredit = async (
  scopedWhere: Pick<
    LedgerEntry.Where,
    'ledgerAccountId' | 'sourceUsageCreditId'
  >,
  transaction: DbTransaction
): Promise<
  {
    usageCreditId: string
    ledgerAccountId: string
    balance: number
    expiresAt: Date | null
  }[]
> => {
  const usageCredits = await usageCreditsFromLedgerEntryWhere(
    scopedWhere,
    transaction
  )
  const result = await transaction
    .select()
    .from(ledgerEntries)
    .where(
      and(
        whereClauseFromObject(ledgerEntries, scopedWhere),
        balanceTypeWhereStatement('available'),
        discardedAtFilterOutStatement()
      )
    )
  const entriesByUsageCreditId = new Map<
    string,
    LedgerEntry.Record[]
  >()
  result.forEach((item) => {
    const usageCreditId = item.sourceUsageCreditId
    if (!usageCreditId) {
      return
    }
    if (!entriesByUsageCreditId.has(usageCreditId)) {
      entriesByUsageCreditId.set(usageCreditId, [])
    }
    entriesByUsageCreditId
      .get(usageCreditId)
      ?.push(ledgerEntriesSelectSchema.parse(item))
  })
  const expiresAtByUsageCreditId = new Map<string, Date>()
  usageCredits.forEach((usageCredit) => {
    if (usageCredit.expiresAt) {
      expiresAtByUsageCreditId.set(
        usageCredit.id,
        usageCredit.expiresAt
      )
    }
  })
  /**
   * Assumptions to test:
   * 1. Each usageCreditId will be unique
   * 2. Expires at will match the usageCreditId
   * 3. LedgerAccountId will match the ledger account implied by the usage credit id
   */
  const balances = Array.from(entriesByUsageCreditId.entries()).map(
    ([usageCreditId, entries]) => {
      return {
        usageCreditId,
        balance: balanceFromEntries(entries),
        ledgerAccountId: entries[0].ledgerAccountId,
        expiresAt:
          expiresAtByUsageCreditId.get(usageCreditId) ?? null,
      }
    }
  )
  return balances
}

const usageEventsFromLedgerEntryWhere = (
  scopedWhere: Pick<LedgerEntry.Where, 'sourceUsageEventId'>,
  transaction: DbTransaction
) => {
  if (!scopedWhere.sourceUsageEventId) {
    return []
  }
  if (typeof scopedWhere.sourceUsageEventId === 'string') {
    return selectUsageEvents(
      {
        id: scopedWhere.sourceUsageEventId,
      },
      transaction
    )
  }
  const definedUsageEventIds = scopedWhere.sourceUsageEventId.filter(
    (id): id is string => id !== null
  )
  if (definedUsageEventIds.length === 0) {
    return []
  }
  return selectUsageEvents(
    {
      id: definedUsageEventIds,
    },
    transaction
  )
}

export const aggregateOutstandingBalanceForUsageCosts = async (
  scopedWhere: Pick<
    LedgerEntry.Where,
    'ledgerAccountId' | 'sourceUsageEventId'
  >,
  transaction: DbTransaction
): Promise<
  {
    usageEventId: string
    usageMeterId: string
    ledgerAccountId: string
    balance: number
  }[]
> => {
  const usageEvents = await usageEventsFromLedgerEntryWhere(
    scopedWhere,
    transaction
  )
  const result = await transaction
    .select()
    .from(ledgerEntries)
    .where(
      and(
        whereClauseFromObject(ledgerEntries, scopedWhere),
        balanceTypeWhereStatement('posted'),
        discardedAtFilterOutStatement()
      )
    )
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
        balance: balanceFromEntries(entries),
        ledgerAccountId: entries[0].ledgerAccountId,
        usageMeterId: entries[0].usageMeterId!,
      }
    }
  )
  return balances
}
