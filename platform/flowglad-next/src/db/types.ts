import type { Event } from '@db-core/schema/events'
import type {
  CacheDependencyKey,
  CacheRecomputationContext,
} from '@/utils/cache'
import type { LedgerCommand } from './ledgerManager/ledgerManagerTypes'

// Re-export pure types from db-core for backwards compatibility
export type {
  DbTransaction,
  PgNumberColumn,
  PgSerialColumn,
  PgStringColumn,
  PgTable,
  PgTableWithCreatedAtAndId,
  PgTableWithId,
  PgTableWithIdAndPricingModelId,
  PgTableWithPosition,
  PgTimestampColumn,
  PgTransaction,
  SQLWrapper,
} from '@db-core/schemaTypes'

// Import DbTransaction for use in this file's type definitions
import type { DbTransaction } from '@db-core/schemaTypes'

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
 * @internal Not exported - use TransactionEffectsContext instead of individual callbacks.
 */
interface TransactionCallbacks {
  /**
   * Queue cache dependency keys to be invalidated after the transaction commits.
   * Use CacheDependency helpers to construct keys.
   *
   * @example
   * invalidateCache(
   *   CacheDependency.subscriptionItems(subscriptionId),
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
  /**
   * Cache recomputation context.
   * Automatically constructed by transaction wrappers based on auth context.
   */
  cacheRecomputationContext: CacheRecomputationContext
}

/**
 * Effects fields with optional callbacks.
 * Used by standard transaction wrappers where callbacks may not be provided.
 * @internal
 */
type OptionalEffectsFields = {
  /**
   * Accumulated side effects. Only available when using transaction wrappers.
   * Prefer using the callback methods.
   */
  effects?: TransactionEffects
} & Partial<TransactionCallbacks>

/**
 * Effects fields with required callbacks.
 * Used by comprehensive transaction wrappers that always provide callbacks.
 * @internal
 */
type RequiredEffectsFields = {
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
  extends Pick<
      BaseTransactionParams,
      'transaction' | 'cacheRecomputationContext'
    >,
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

/**
 * No-op transaction callbacks for use in contexts where cache invalidation,
 * events, and ledger commands are not needed (e.g., creating new entities
 * during organization setup, scripts, or tests).
 *
 * @example
 * ```typescript
 * const ctx = createTransactionEffectsContext(transaction, cacheRecomputationContext)
 * await someFunction(params, ctx)
 * ```
 */
export const noopTransactionCallbacks = {
  invalidateCache: () => {},
  emitEvent: () => {},
  enqueueLedgerCommand: () => {},
} as const

/**
 * Creates a TransactionEffectsContext with noop callbacks.
 * Use this for scenarios where you have a transaction but don't need
 * cache invalidation (e.g., creating new entities, scripts, tests).
 */
export const createTransactionEffectsContext = (
  transaction: DbTransaction,
  cacheRecomputationContext: CacheRecomputationContext
): TransactionEffectsContext => ({
  transaction,
  cacheRecomputationContext,
  ...noopTransactionCallbacks,
})
