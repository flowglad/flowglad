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
 * Callback function signatures for transaction side effects.
 * These are the methods used to queue cache invalidations, events, and ledger commands.
 */
export interface TransactionCallbacks {
  /**
   * Queue cache dependency keys to be invalidated after the transaction commits.
   * Use CacheDependency helpers to construct keys.
   *
   * @example
   * invalidateCache(
   *   CacheDependency.subscriptionItemFeatures(itemId),
   *   CacheDependency.customerSubscriptions(customerId)
   * )
   */
  invalidateCache: (...keys: CacheDependencyKey[]) => void
  /**
   * Queue events to be inserted before the transaction commits.
   *
   * @example
   * emitEvent(createSubscriptionCreatedEvent(subscription))
   */
  emitEvent: (...events: Event.Insert[]) => void
  /**
   * Queue ledger commands to be processed before the transaction commits.
   *
   * @example
   * enqueueLedgerCommand(creditCommand)
   */
  enqueueLedgerCommand: (...commands: LedgerCommand[]) => void
}

/**
 * Base properties shared by all transaction param types.
 */
export interface BaseTransactionParams {
  transaction: DbTransaction
  livemode: boolean
}

/**
 * Effects fields with optional callbacks.
 * Used by standard transaction wrappers where callbacks may not be provided.
 */
export type OptionalEffectsFields = {
  /**
   * Accumulated side effects. Only available when using transaction wrappers.
   * Prefer using the callback methods.
   */
  effects?: TransactionEffects
} & Partial<TransactionCallbacks>

/**
 * Effects fields with required callbacks.
 * Used by comprehensive transaction wrappers that always provide callbacks.
 */
export type RequiredEffectsFields = {
  effects: TransactionEffects
} & TransactionCallbacks

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
export interface TransactionEffectsContext
  extends Pick<BaseTransactionParams, 'transaction'>,
    TransactionCallbacks {}

export interface AuthenticatedTransactionParams
  extends BaseTransactionParams,
    OptionalEffectsFields {
  userId: string
  organizationId: string
}

export interface AdminTransactionParams
  extends BaseTransactionParams,
    OptionalEffectsFields {
  userId: 'ADMIN'
}

/**
 * Stricter version of AuthenticatedTransactionParams used by comprehensiveAuthenticatedTransaction.
 * All callback methods are required (not optional) since they're always provided at runtime.
 */
export type ComprehensiveAuthenticatedTransactionParams = Omit<
  AuthenticatedTransactionParams,
  keyof OptionalEffectsFields
> &
  RequiredEffectsFields

/**
 * Stricter version of AdminTransactionParams used by comprehensiveAdminTransaction.
 * All callback methods are required (not optional) since they're always provided at runtime.
 */
export type ComprehensiveAdminTransactionParams = Omit<
  AdminTransactionParams,
  keyof OptionalEffectsFields
> &
  RequiredEffectsFields
