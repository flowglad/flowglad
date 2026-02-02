import type { Event } from '@db-core/schema/events'
import type { LedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import type {
  CacheRecomputationContext,
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
 * Creates a TransactionEffectsContext that discards all effects.
 * Use this when the test doesn't need to verify or process callback behavior.
 */
export function createDiscardingEffectsContext(
  transaction: DbTransaction,
  cacheRecomputationContext: CacheRecomputationContext = {
    livemode: true,
  }
): TransactionEffectsContext {
  return {
    transaction,
    cacheRecomputationContext,
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
 * Creates a TransactionEffectsContext that captures effects for assertion.
 * Use this when the test needs to verify what side effects were emitted.
 *
 * @example
 * ```typescript
 * const { ctx, effects } = createCapturingEffectsContext(transaction)
 *
 * await cancelSubscriptionImmediately({ subscription }, ctx)
 *
 * expect(effects.events).toHaveLength(1)
 * expect(effects.events[0].type).toBe(FlowgladEventType.SubscriptionCanceled)
 * ```
 */
export function createCapturingEffectsContext(
  transaction: DbTransaction,
  cacheRecomputationContext: CacheRecomputationContext = {
    livemode: true,
  }
): {
  ctx: TransactionEffectsContext
  effects: CapturedEffects
} {
  const { callbacks, effects } = createCapturingCallbacks()
  return {
    ctx: {
      transaction,
      cacheRecomputationContext,
      ...callbacks,
    },
    effects,
  }
}

/**
 * Creates a TransactionEffectsContext that processes effects through the
 * comprehensive transaction infrastructure.
 * Use this when calling functions that expect TransactionEffectsContext from within
 * comprehensiveAdminTransaction callbacks, to ensure effects are properly processed.
 *
 * @example
 * ```typescript
 * await comprehensiveAdminTransaction(async (params) => {
 *   await attemptToTransitionSubscriptionBillingPeriod(
 *     billingPeriod,
 *     createProcessingEffectsContext(params)
 *   )
 *   return { result: null }
 * })
 * ```
 */
export function createProcessingEffectsContext(
  params:
    | ComprehensiveAdminTransactionParams
    | ComprehensiveAuthenticatedTransactionParams
): TransactionEffectsContext {
  return {
    transaction: params.transaction,
    cacheRecomputationContext: params.cacheRecomputationContext,
    invalidateCache: params.invalidateCache,
    emitEvent: params.emitEvent,
    enqueueLedgerCommand: params.enqueueLedgerCommand,
  }
}

/**
 * Adds admin cacheRecomputationContext to a params object based on its livemode value.
 * Use this helper to reduce boilerplate when calling functions that require
 * cacheRecomputationContext in tests.
 *
 * @example
 * ```typescript
 * await createPricingModelBookkeeping(
 *   { pricingModel: { name: 'Test', isDefault: true } },
 *   withAdminCacheContext({
 *     transaction,
 *     organizationId,
 *     livemode,
 *   })
 * )
 * ```
 */
export function withAdminCacheContext<
  T extends { livemode: boolean },
>(
  params: T
): T & { cacheRecomputationContext: CacheRecomputationContext } {
  return {
    ...params,
    cacheRecomputationContext: {
      livemode: params.livemode,
    },
  }
}

/**
 * Creates a full TransactionEffectsContext with no-op callbacks plus additional params.
 * Use this when calling functions that require TransactionEffectsContext from within
 * adminTransaction callbacks (which only provide transaction), when the test doesn't
 * need to verify side effects.
 *
 * @example
 * ```typescript
 * await adminTransaction(async ({ transaction }) => {
 *   await createPricingModelBookkeeping(
 *     { pricingModel: { name: 'Test', isDefault: true } },
 *     withDiscardingEffectsContext({
 *       transaction,
 *       organizationId,
 *       livemode,
 *     })
 *   )
 * })
 * ```
 */
export function withDiscardingEffectsContext<
  T extends { transaction: DbTransaction; livemode: boolean },
>(params: T): T & TransactionEffectsContext {
  return {
    ...params,
    cacheRecomputationContext: {
      livemode: params.livemode,
    },
    invalidateCache: noopInvalidateCache,
    emitEvent: noopEmitEvent,
    enqueueLedgerCommand: noopEnqueueLedgerCommand,
  }
}
