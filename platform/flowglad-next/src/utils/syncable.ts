/**
 * Syncable higher-order function for TRPC resolvers.
 *
 * This module provides the infrastructure for declaring which TRPC resolvers
 * are "syncable" - meaning their outputs should be pushed to merchants via
 * the sync event system when underlying data changes.
 *
 * Key concepts:
 * - `syncable()` wraps a TRPC resolver and registers it for sync
 * - `affectedBy` declares how to derive resolver inputs from invalidations
 * - Registry populated at module load time (when TRPC router initializes)
 */

import type {
  AnyDependency,
  SyncDependency,
  SyncPayload,
} from '@/utils/dependency'

// ============================================================================
// Types
// ============================================================================

/** Sync dependency type names (what gets pushed over the wire) */
type SyncDependencyType = SyncDependency['type']

/** All dependency type names (including cache-only) */
type DependencyType = AnyDependency['type']

/**
 * Configuration for a syncable resolver.
 *
 * @template TType - The sync dependency type this resolver handles
 * @template TOutput - The resolver's output type
 * @template TContext - The TRPC context type
 */
export interface SyncableConfig<
  TType extends SyncDependencyType,
  TOutput,
  TContext,
> {
  /**
   * The resolver function that fetches data for this sync type.
   * Input type is enforced to match SyncPayload<TType>.
   */
  resolver: (opts: {
    input: SyncPayload<TType>
    ctx: TContext
  }) => Promise<TOutput>

  /**
   * Declares which invalidation dependencies affect this sync type,
   * and how to derive this resolver's input from each.
   *
   * Keys are dependency types that, when invalidated, should trigger
   * recomputation of this sync type.
   *
   * Values are either:
   * - 'direct': the invalidation payload IS the resolver input (1:1 mapping)
   * - A function: computes the resolver input(s) from the invalidation payload
   *
   * The function form supports fan-out by returning an array of inputs.
   */
  affectedBy: {
    [K in DependencyType]?:
      | 'direct'
      | ((params: {
          payload: Extract<AnyDependency, { type: K }>['payload']
          ctx: TContext
        }) => Promise<SyncPayload<TType> | SyncPayload<TType>[]>)
  }
}

/**
 * Internal registry entry storing the resolver and its affectedBy mappings.
 */
interface SyncableRegistryEntry {
  resolver: (opts: {
    input: unknown
    ctx: unknown
  }) => Promise<unknown>
  affectedBy: Record<
    string,
    | 'direct'
    | ((params: {
        payload: unknown
        ctx: unknown
      }) => Promise<unknown | unknown[]>)
  >
}

// ============================================================================
// Registry
// ============================================================================

/**
 * Registry of all syncable configurations, populated at module load time.
 *
 * When TRPC routers are initialized, `syncable()` calls register their
 * configurations here. This registry is used at runtime to:
 * 1. Find which sync types are affected by a given invalidation
 * 2. Run the affectedBy functions to compute resolver inputs
 * 3. Execute resolvers and emit sync events
 */
export const syncableRegistry = new Map<
  SyncDependencyType,
  SyncableRegistryEntry
>()

// ============================================================================
// Main API
// ============================================================================

/**
 * Higher-order function that marks a TRPC resolver as syncable.
 *
 * TYPE SAFETY: The resolver's input type MUST match the payload type
 * for the declared dependency type. This is enforced via SyncPayload<T>.
 *
 * At call time, registers this resolver and its affectedBy mappings in
 * the global registry. The returned function is the original resolver,
 * suitable for use in TRPC procedure definitions.
 *
 * When an invalidation dependency is triggered:
 * 1. System finds all syncable types with matching affectedBy declarations
 * 2. Runs the affectedBy function to compute resolver input(s)
 * 3. Runs resolver with each computed input
 * 4. Pushes results to sync stream
 *
 * @example
 * export const getCustomerSubscriptions = protectedProcedure
 *   .input(z.object({ customerId: z.string() }))
 *   .query(
 *     syncable('customerSubscriptions', {
 *       resolver: async ({ input, ctx }) => {
 *         return selectSubscriptionsWithDetails(input.customerId, ctx.transaction)
 *       },
 *       affectedBy: {
 *         // Direct match - customerSubscriptions invalidation maps 1:1
 *         customerSubscriptions: 'direct',
 *
 *         // Derived - when a subscription changes, look up its customer
 *         subscription: async ({ payload, ctx }) => {
 *           const sub = await getSubscription(payload.subscriptionId, ctx.transaction)
 *           return { customerId: sub.customerId }
 *         },
 *       }
 *     })
 *   )
 *
 * @param dependencyType - The sync dependency type this resolver handles
 * @param config - The resolver and affectedBy configuration
 * @returns The resolver function (pass-through for TRPC procedure)
 */
export function syncable<
  TType extends SyncDependencyType,
  TOutput,
  TContext,
>(
  dependencyType: TType,
  config: SyncableConfig<TType, TOutput, TContext>
): (opts: {
  input: SyncPayload<TType>
  ctx: TContext
}) => Promise<TOutput> {
  // Register in the global registry at call time
  syncableRegistry.set(dependencyType, {
    resolver: config.resolver as SyncableRegistryEntry['resolver'],
    affectedBy:
      config.affectedBy as SyncableRegistryEntry['affectedBy'],
  })

  // Return the resolver for use in TRPC procedure definition
  return config.resolver
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Result of finding syncables affected by an invalidation.
 */
export interface AffectedSyncable {
  /** The sync type that should be recomputed */
  syncType: SyncDependencyType
  /** The affectedBy function or 'direct' marker */
  affectedByFn:
    | 'direct'
    | ((params: {
        payload: unknown
        ctx: unknown
      }) => Promise<unknown | unknown[]>)
  /** The resolver function to execute */
  resolver: (opts: {
    input: unknown
    ctx: unknown
  }) => Promise<unknown>
}

/**
 * Get all registered syncable configs that are affected by a given dependency type.
 *
 * Returns an array of { syncType, affectedByFn, resolver } for each syncable
 * that has declared an `affectedBy` mapping for the given invalidation type.
 *
 * @example
 * const affected = getSyncablesAffectedBy('subscription')
 * // Returns array of syncables that declared affectedBy.subscription
 *
 * for (const { syncType, affectedByFn, resolver } of affected) {
 *   const inputs = affectedByFn === 'direct'
 *     ? [payload]
 *     : await affectedByFn({ payload, ctx })
 *   for (const input of Array.isArray(inputs) ? inputs : [inputs]) {
 *     const data = await resolver({ input, ctx })
 *     // emit sync event...
 *   }
 * }
 *
 * @param invalidationType - The dependency type that was invalidated
 * @returns Array of affected syncables with their resolvers
 */
export function getSyncablesAffectedBy(
  invalidationType: DependencyType
): AffectedSyncable[] {
  const results: AffectedSyncable[] = []

  for (const [syncType, entry] of syncableRegistry) {
    const affectedByFn = entry.affectedBy[invalidationType]
    if (affectedByFn !== undefined) {
      results.push({
        syncType,
        affectedByFn,
        resolver: entry.resolver,
      })
    }
  }

  return results
}

/**
 * Check if a sync dependency type has been registered.
 *
 * @param syncType - The sync dependency type to check
 * @returns true if the type has been registered via syncable()
 */
export function isSyncTypeRegistered(
  syncType: SyncDependencyType
): boolean {
  return syncableRegistry.has(syncType)
}

/**
 * Get the registry entry for a specific sync type.
 *
 * @param syncType - The sync dependency type
 * @returns The registry entry or undefined if not registered
 */
export function getSyncableConfig(
  syncType: SyncDependencyType
): SyncableRegistryEntry | undefined {
  return syncableRegistry.get(syncType)
}
