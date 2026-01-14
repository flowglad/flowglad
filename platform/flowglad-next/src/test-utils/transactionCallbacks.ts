import type { LedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import type { Event } from '@/db/schema/events'
import type {
  ComprehensiveAdminTransactionParams,
  ComprehensiveAuthenticatedTransactionParams,
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'
import type { CacheDependencyKey } from '@/utils/cache'

/**
 * No-op callbacks for use in tests that don't need to verify cache invalidation or event emission.
 * These are useful when testing functions that require the callbacks but the test
 * doesn't need to assert on the callback behavior.
 */
export const noopInvalidateCache = (
  ..._keys: CacheDependencyKey[]
): void => {}

export const noopEmitEvent = (..._events: Event.Insert[]): void => {}

export const noopEnqueueLedgerCommand = (
  ..._commands: LedgerCommand[]
): void => {}

/**
 * Creates a TransactionEffectsContext with no-op callbacks for tests.
 * Use this when the test doesn't need to verify callback behavior.
 */
export function createNoopContext(
  transaction: DbTransaction
): TransactionEffectsContext {
  return {
    transaction,
    invalidateCache: noopInvalidateCache,
    emitEvent: noopEmitEvent,
    enqueueLedgerCommand: noopEnqueueLedgerCommand,
  }
}

/**
 * Captured side effects from transaction callbacks.
 * Use with createCapturingCallbacks() to capture and verify side effects in tests.
 */
export interface CapturedEffects {
  cacheInvalidations: CacheDependencyKey[]
  events: Event.Insert[]
  ledgerCommands: LedgerCommand[]
}

/**
 * Creates capturing callbacks that store emitted side effects for later assertion.
 * Use this when you need to verify what events, cache invalidations, or ledger commands
 * were emitted during a function call.
 *
 * @example
 * ```typescript
 * const { callbacks, effects } = createCapturingCallbacks()
 *
 * await cancelSubscriptionImmediately(
 *   { subscription },
 *   transaction,
 *   callbacks.invalidateCache,
 *   callbacks.emitEvent
 * )
 *
 * expect(effects.events).toHaveLength(1)
 * expect(effects.events[0].type).toBe(FlowgladEventType.SubscriptionCanceled)
 * expect(effects.cacheInvalidations).toContain(
 *   CacheDependency.customerSubscriptions(customer.id)
 * )
 * ```
 */
export function createCapturingCallbacks(): {
  callbacks: {
    invalidateCache: (...keys: CacheDependencyKey[]) => void
    emitEvent: (...events: Event.Insert[]) => void
    enqueueLedgerCommand: (...commands: LedgerCommand[]) => void
  }
  effects: CapturedEffects
} {
  const effects: CapturedEffects = {
    cacheInvalidations: [],
    events: [],
    ledgerCommands: [],
  }

  return {
    callbacks: {
      invalidateCache: (...keys: CacheDependencyKey[]) => {
        effects.cacheInvalidations.push(...keys)
      },
      emitEvent: (...events: Event.Insert[]) => {
        effects.events.push(...events)
      },
      enqueueLedgerCommand: (...commands: LedgerCommand[]) => {
        effects.ledgerCommands.push(...commands)
      },
    },
    effects,
  }
}

/**
 * Creates a TransactionEffectsContext with capturing callbacks for tests.
 * Use this when the test needs to verify what side effects were emitted.
 *
 * @example
 * ```typescript
 * const { ctx, effects } = createCapturingContext(transaction)
 *
 * await cancelSubscriptionImmediately({ subscription }, ctx)
 *
 * expect(effects.events).toHaveLength(1)
 * expect(effects.events[0].type).toBe(FlowgladEventType.SubscriptionCanceled)
 * ```
 */
export function createCapturingContext(transaction: DbTransaction): {
  ctx: TransactionEffectsContext
  effects: CapturedEffects
} {
  const { callbacks, effects } = createCapturingCallbacks()
  return {
    ctx: {
      transaction,
      ...callbacks,
    },
    effects,
  }
}

/**
 * Extracts TransactionEffectsContext from ComprehensiveAdminTransactionParams.
 * Use this when calling functions that expect TransactionEffectsContext from within
 * comprehensiveAdminTransaction callbacks, to ensure effects are properly tracked.
 *
 * @example
 * ```typescript
 * await comprehensiveAdminTransaction(async (params) => {
 *   await attemptToTransitionSubscriptionBillingPeriod(
 *     billingPeriod,
 *     extractEffectsContext(params)
 *   )
 *   return { result: null }
 * })
 * ```
 */
export function extractEffectsContext(
  params:
    | ComprehensiveAdminTransactionParams
    | ComprehensiveAuthenticatedTransactionParams
): TransactionEffectsContext {
  return {
    transaction: params.transaction,
    invalidateCache: params.invalidateCache,
    emitEvent: params.emitEvent,
    enqueueLedgerCommand: params.enqueueLedgerCommand,
  }
}
