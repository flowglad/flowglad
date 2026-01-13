import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

export type { PgTable, PgTransaction } from 'drizzle-orm/pg-core'

import type { ColumnBaseConfig, SQLWrapper } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { CacheDependencyKey } from '@/utils/cache'
import type { LedgerCommand } from './ledgerManager/ledgerManagerTypes'
import type { Event } from './schema/events'

export type { SQLWrapper } from 'drizzle-orm'

export type DbTransaction = Parameters<
  Parameters<
    PostgresJsDatabase<Record<string, never>>['transaction']
  >[0]
>[0]

export type PgNumberColumn = PgColumn<
  ColumnBaseConfig<'number', 'number'>,
  {},
  {}
>

export type PgSerialColumn = PgColumn<
  ColumnBaseConfig<'number', 'serial'>,
  {},
  {}
>

export type PgStringColumn = PgColumn<
  ColumnBaseConfig<'string', 'string'>,
  {},
  {}
>

// For timestampWithTimezoneColumn() columns only - stores ms as numbers, timezone-aware
export type PgTimestampColumn = PgColumn<
  {
    name: string
    tableName: string
    dataType: 'custom'
    columnType: 'PgCustomColumn'
    data: number
    driverParam: string | Date
    notNull: boolean
    hasDefault: boolean
    isPrimaryKey: boolean
    isAutoincrement: boolean
    hasRuntimeDefault: boolean
    enumValues: undefined
    baseColumn: never
    identity: undefined
    generated: undefined
  },
  {},
  {}
>

export type PgTableWithId = PgTable & {
  id: SQLWrapper
}

export type PgTableWithCreatedAtAndId = PgTable & {
  createdAt: SQLWrapper
  id: SQLWrapper
}

export type PgTableWithPosition = PgTable & {
  position: SQLWrapper
  createdAt: SQLWrapper
  id: SQLWrapper
}

export type PgTableWithIdAndPricingModelId = PgTable & {
  id: SQLWrapper
  pricingModelId: SQLWrapper
}

/**
 * Accumulated side effects collected during a transaction.
 * Effects are processed at different times relative to the transaction commit:
 *
 * **Before commit (inside transaction):**
 * - `eventsToInsert` - Events are bulk inserted before commit to ensure atomicity
 * - `ledgerCommands` - Ledger commands are processed before commit for consistency
 *
 * **After commit (outside transaction):**
 * - `cacheInvalidations` - Cache keys are invalidated after commit to avoid stale reads
 */
export interface TransactionEffects {
  /** Cache keys to invalidate. Processed AFTER commit (fire-and-forget). */
  cacheInvalidations: CacheDependencyKey[]
  /** Events to insert. Processed BEFORE commit (inside transaction). */
  eventsToInsert: Event.Insert[]
  /** Ledger commands to process. Processed BEFORE commit (inside transaction). */
  ledgerCommands: LedgerCommand[]
}

/**
 * Context object containing the transaction and effect callbacks.
 * Use this type for functions that need to emit side effects within a transaction.
 *
 * @example
 * ```typescript
 * export const someFunction = async (
 *   params: Params,
 *   ctx: TransactionEffectsContext
 * ): Promise<Result> => {
 *   const { transaction, emitEvent, enqueueLedgerCommand, invalidateCache } = ctx
 *
 *   emitEvent(event1)
 *   enqueueLedgerCommand(cmd1)
 *   invalidateCache(key1)
 *
 *   return someResult
 * }
 * ```
 */
export interface TransactionEffectsContext {
  transaction: DbTransaction
  /**
   * Queue cache dependency keys to be invalidated after the transaction commits.
   * Use CacheDependency helpers to construct keys.
   */
  invalidateCache: (...keys: CacheDependencyKey[]) => void
  /**
   * Queue events to be inserted before the transaction commits.
   */
  emitEvent: (...events: Event.Insert[]) => void
  /**
   * Queue ledger commands to be processed before the transaction commits.
   */
  enqueueLedgerCommand: (...commands: LedgerCommand[]) => void
}

export interface AuthenticatedTransactionParams {
  transaction: DbTransaction
  livemode: boolean
  userId: string
  organizationId: string
  /**
   * Accumulated side effects. Only available when using transaction wrappers.
   * Prefer using the helper methods below.
   */
  effects?: TransactionEffects
  /**
   * Queue cache dependency keys to be invalidated after the transaction commits.
   * Use CacheDependency helpers to construct keys.
   *
   * @example
   * params.invalidateCache(
   *   CacheDependency.subscriptionItemFeatures(itemId),
   *   CacheDependency.customerSubscriptions(customerId)
   * )
   */
  invalidateCache?: (...keys: CacheDependencyKey[]) => void
  /**
   * Queue events to be inserted before the transaction commits.
   *
   * @example
   * params.emitEvent(createSubscriptionCreatedEvent(subscription))
   */
  emitEvent?: (...events: Event.Insert[]) => void
  /**
   * Queue ledger commands to be processed before the transaction commits.
   *
   * @example
   * params.enqueueLedgerCommand(creditCommand)
   */
  enqueueLedgerCommand?: (...commands: LedgerCommand[]) => void
}

export interface AdminTransactionParams {
  transaction: DbTransaction
  userId: 'ADMIN'
  livemode: boolean
  /**
   * Accumulated side effects. Only available when using transaction wrappers.
   * Prefer using the helper methods below.
   */
  effects?: TransactionEffects
  /**
   * Queue cache dependency keys to be invalidated after the transaction commits.
   * Use CacheDependency helpers to construct keys.
   */
  invalidateCache?: (...keys: CacheDependencyKey[]) => void
  /**
   * Queue events to be inserted before the transaction commits.
   */
  emitEvent?: (...events: Event.Insert[]) => void
  /**
   * Queue ledger commands to be processed before the transaction commits.
   */
  enqueueLedgerCommand?: (...commands: LedgerCommand[]) => void
}

/**
 * Stricter version of AuthenticatedTransactionParams used by comprehensiveAuthenticatedTransaction.
 * All callback methods are required (not optional) since they're always provided at runtime.
 */
export interface ComprehensiveAuthenticatedTransactionParams {
  transaction: DbTransaction
  livemode: boolean
  userId: string
  organizationId: string
  effects: TransactionEffects
  invalidateCache: (...keys: CacheDependencyKey[]) => void
  emitEvent: (...events: Event.Insert[]) => void
  enqueueLedgerCommand: (...commands: LedgerCommand[]) => void
}

/**
 * Stricter version of AdminTransactionParams used by comprehensiveAdminTransaction.
 * All callback methods are required (not optional) since they're always provided at runtime.
 */
export interface ComprehensiveAdminTransactionParams {
  transaction: DbTransaction
  userId: 'ADMIN'
  livemode: boolean
  effects: TransactionEffects
  invalidateCache: (...keys: CacheDependencyKey[]) => void
  emitEvent: (...events: Event.Insert[]) => void
  enqueueLedgerCommand: (...commands: LedgerCommand[]) => void
}
