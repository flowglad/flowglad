import type { Event } from '@db-core/schema/events'
import type { CacheDependencyKey } from '@/utils/cache'
import type {
  CacheDependency,
  SyncDependency,
  SyncEmissionContext,
} from '@/utils/dependency'
import type { LedgerCommand } from './ledgerManager/ledgerManagerTypes'

/**
 * Options passed to task.trigger() when dispatching.
 */
export interface TriggerTaskOptions {
  idempotencyKey?: string
}

/**
 * Represents a trigger task invocation to be dispatched after transaction commit.
 * Generic over the task type to preserve payload type safety.
 */
export interface QueuedTriggerTask<TPayload = unknown> {
  /** User-provided key for retrieving the handle after dispatch */
  key: string
  /** The task to trigger */
  task: {
    id: string
    trigger: (
      payload: TPayload,
      options?: TriggerTaskOptions
    ) => Promise<{ id: string }>
  }
  /** The payload to pass to the task */
  payload: TPayload
  /** Options to pass to task.trigger() */
  options?: TriggerTaskOptions
}

/**
 * Handle returned after a trigger task is dispatched.
 */
export interface TriggerTaskHandle {
  /** The Trigger.dev run ID */
  id: string
}

/**
 * A sync-enabled dependency invalidation with organization context.
 * Will emit sync events after commit.
 */
export interface SyncInvalidation {
  dependency: SyncDependency
  context: SyncEmissionContext
}

/**
 * A cache-only dependency invalidation.
 * Only cache invalidation will occur (no sync events).
 */
export interface CacheInvalidation {
  dependency: CacheDependency
}

/**
 * A dependency invalidation to be processed after transaction commit.
 * At processing time:
 * - Cache keys are derived from all dependencies and invalidated
 * - Sync invalidations emit sync events
 */
export type DependencyInvalidation =
  | SyncInvalidation
  | CacheInvalidation

/**
 * Type-safe callback for enqueueing trigger tasks.
 * Accepts any Trigger.dev task and its corresponding payload.
 * The key is used to retrieve the handle after the transaction commits.
 */
export type EnqueueTriggerTaskCallback = <TPayload>(
  key: string,
  task: {
    id: string
    trigger: (
      payload: TPayload,
      options?: TriggerTaskOptions
    ) => Promise<{ id: string }>
  },
  payload: TPayload,
  options?: TriggerTaskOptions
) => void

/**
 * Return type for comprehensive transaction functions.
 * Contains both the user's result and any trigger handles from dispatched tasks.
 */
export interface TransactionResult<T> {
  /** The result returned by the user's transaction function */
  result: T
  /** Handles for trigger tasks dispatched after commit, keyed by user-provided key */
  triggerHandles: Map<string, TriggerTaskHandle>
}

/**
 * Simplified cache recomputation context.
 * Previously contained type/role information for recomputing cached values,
 * but since recomputation was removed, only livemode is needed.
 */
export interface CacheRecomputationContext {
  livemode: boolean
}

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
 * - `invalidations` - Structured dependencies: cache keys derived and invalidated,
 *   sync-enabled deps with context emit sync events
 * - `cacheInvalidations` - Legacy string-based cache keys (deprecated, use invalidations)
 */
export interface TransactionEffects {
  /**
   * Structured dependency invalidations. At processing time:
   * - Cache keys are derived from all dependencies and invalidated
   * - Sync-enabled dependencies with context emit sync events
   */
  invalidations: DependencyInvalidation[]
  /**
   * Legacy string-based cache keys to invalidate.
   * @deprecated Use structured dependencies via invalidations instead
   */
  cacheInvalidations: CacheDependencyKey[]
  /** Events to insert. Processed BEFORE commit (inside transaction). */
  eventsToInsert: Event.Insert[]
  /** Ledger commands to process. Processed BEFORE commit (inside transaction). */
  ledgerCommands: LedgerCommand[]
  /** Trigger tasks to dispatch after commit. */
  triggerTasks: QueuedTriggerTask[]
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
  /**
   * Queue a trigger task to be dispatched after the transaction commits.
   * The task will only be triggered if the transaction commits successfully.
   * Use the key to retrieve the Trigger.dev handle from the result's triggerHandles map.
   *
   * @example
   * ctx.enqueueTriggerTask('billingRun', attemptBillingRunTask, { billingRun }, { idempotencyKey: `billing-${id}` })
   * // After transaction: result.triggerHandles.get('billingRun')?.id
   */
  enqueueTriggerTask: EnqueueTriggerTaskCallback
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
export const noopTransactionCallbacks: TransactionCallbacks = {
  invalidateCache: () => {},
  emitEvent: () => {},
  enqueueLedgerCommand: () => {},
  enqueueTriggerTask: () => {},
}

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
