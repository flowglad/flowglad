/**
 * Structured dependency types for cache invalidation and sync events.
 *
 * ALL dependencies are typed objects with payloads - no string construction at call sites.
 * Cache keys are derived internally from structured objects via `dependencyToCacheKey()`.
 *
 * The `syncEnabled` discriminator determines:
 * - Compile time: overload resolution for sync-aware functions
 * - Runtime: whether to queue sync events on invalidation
 */

// ============================================================================
// Base Types
// ============================================================================

/**
 * Base type for dependencies that trigger sync events on invalidation.
 * These dependencies represent data that merchants want to replicate locally.
 */
export interface SyncEnabledDependency<
  TType extends string,
  TPayload,
> {
  readonly type: TType
  readonly payload: TPayload
  readonly syncEnabled: true
}

/**
 * Base type for dependencies that only invalidate cache (no sync).
 * These dependencies represent internal/system data not exposed via sync API.
 */
export interface CacheOnlyDependency<TType extends string, TPayload> {
  readonly type: TType
  readonly payload: TPayload
  readonly syncEnabled: false
}

// ============================================================================
// Sync-Enabled Dependency Types
// ============================================================================

/**
 * Dependency for a customer's subscriptions.
 * Invalidate when subscriptions for this customer change (create/delete/update).
 */
export type CustomerSubscriptionsDep = SyncEnabledDependency<
  'customerSubscriptions',
  { customerId: string }
>

/**
 * Dependency for a single subscription.
 * Invalidate when this subscription's content changes (status, dates, items, etc.).
 */
export type SubscriptionDep = SyncEnabledDependency<
  'subscription',
  { subscriptionId: string }
>

// ============================================================================
// Cache-Only Dependency Types
// ============================================================================

/**
 * Dependency for organization settings.
 * Cache-only: not exposed via sync API.
 */
export type OrganizationSettingsDep = CacheOnlyDependency<
  'organizationSettings',
  { orgId: string }
>

/**
 * Dependency for API key lookups.
 * Cache-only: sensitive data not exposed via sync API.
 */
export type ApiKeyLookupDep = CacheOnlyDependency<
  'apiKeyLookup',
  { keyHash: string }
>

// ============================================================================
// Union Types
// ============================================================================

/**
 * Union of all sync-enabled dependency types.
 * Extend this as new sync-enabled types are added.
 */
export type SyncDependency =
  | CustomerSubscriptionsDep
  | SubscriptionDep

/**
 * Union of all cache-only dependency types.
 * Extend this as new cache-only types are added.
 */
export type CacheDependency =
  | OrganizationSettingsDep
  | ApiKeyLookupDep

/**
 * Union of all dependency types.
 */
export type AnyDependency = SyncDependency | CacheDependency

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Map of sync dependency type names to their payload types.
 * Used by `SyncPayload<T>` to extract payload type by dependency type name.
 */
interface SyncPayloadMap {
  customerSubscriptions: CustomerSubscriptionsDep['payload']
  subscription: SubscriptionDep['payload']
}

/**
 * Extract the payload type for a sync-enabled dependency by its type name.
 *
 * @example
 * type CustomerInput = SyncPayload<'customerSubscriptions'>
 * // { customerId: string }
 */
export type SyncPayload<T extends keyof SyncPayloadMap> =
  SyncPayloadMap[T]

/**
 * Extract the dependency type name for all sync-enabled dependencies.
 */
export type SyncDependencyType = SyncDependency['type']

// ============================================================================
// Sync Emission Context
// ============================================================================

/**
 * Context passed to sync emission handlers when dependencies are invalidated.
 * Contains information needed to compute which sync events to emit.
 */
export interface SyncEmissionContext {
  /**
   * The dependency that was invalidated.
   */
  readonly dependency: SyncDependency

  /**
   * Timestamp when the invalidation occurred.
   */
  readonly invalidatedAt: Date

  /**
   * Optional transaction ID for correlation.
   */
  readonly transactionId?: string
}

// ============================================================================
// Dependency Constructors
// ============================================================================

/**
 * Factory functions for creating structured dependency objects.
 *
 * Use these instead of manually constructing dependency objects to ensure
 * type safety and consistency.
 *
 * @example
 * // Sync-enabled dependencies
 * const dep1 = Dependency.customerSubscriptions({ customerId: 'cust_123' })
 * const dep2 = Dependency.subscription({ subscriptionId: 'sub_456' })
 *
 * // Cache-only dependencies
 * const dep3 = Dependency.organizationSettings({ orgId: 'org_789' })
 * const dep4 = Dependency.apiKeyLookup({ keyHash: 'abc123' })
 */
export const Dependency = {
  // === Sync-enabled ===

  /**
   * Create a customer subscriptions dependency.
   * Sync-enabled: triggers sync events on invalidation.
   */
  customerSubscriptions: (payload: {
    customerId: string
  }): CustomerSubscriptionsDep => ({
    type: 'customerSubscriptions',
    payload,
    syncEnabled: true,
  }),

  /**
   * Create a subscription dependency.
   * Sync-enabled: triggers sync events on invalidation.
   */
  subscription: (payload: {
    subscriptionId: string
  }): SubscriptionDep => ({
    type: 'subscription',
    payload,
    syncEnabled: true,
  }),

  // === Cache-only ===

  /**
   * Create an organization settings dependency.
   * Cache-only: no sync events on invalidation.
   */
  organizationSettings: (payload: {
    orgId: string
  }): OrganizationSettingsDep => ({
    type: 'organizationSettings',
    payload,
    syncEnabled: false,
  }),

  /**
   * Create an API key lookup dependency.
   * Cache-only: no sync events on invalidation.
   */
  apiKeyLookup: (payload: { keyHash: string }): ApiKeyLookupDep => ({
    type: 'apiKeyLookup',
    payload,
    syncEnabled: false,
  }),
} as const

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Derive a Redis cache key from a structured dependency.
 *
 * The key format is: `${type}:${payloadKey}:${payloadValue}`
 * For dependencies with multiple payload fields, values are joined with ':'.
 *
 * @example
 * dependencyToCacheKey(Dependency.customerSubscriptions({ customerId: 'cust_123' }))
 * // => 'customerSubscriptions:cust_123'
 *
 * dependencyToCacheKey(Dependency.subscription({ subscriptionId: 'sub_456' }))
 * // => 'subscription:sub_456'
 */
export function dependencyToCacheKey(dep: AnyDependency): string {
  const payloadValues = Object.values(dep.payload)
  return `${dep.type}:${payloadValues.join(':')}`
}

/**
 * Type guard to check if a dependency is sync-enabled.
 *
 * @example
 * const dep = Dependency.customerSubscriptions({ customerId: 'cust_123' })
 * if (isSyncDependency(dep)) {
 *   // dep is narrowed to SyncDependency
 *   console.log('Will trigger sync:', dep.type)
 * }
 */
export function isSyncDependency(
  dep: AnyDependency
): dep is SyncDependency {
  return dep.syncEnabled === true
}

/**
 * Type guard to check if a dependency is cache-only.
 */
export function isCacheOnlyDependency(
  dep: AnyDependency
): dep is CacheDependency {
  return dep.syncEnabled === false
}
