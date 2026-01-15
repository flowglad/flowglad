import type { CacheDependencyKey } from '@/utils/cache'

// Unified output structure for functions running within our transactions
export interface TransactionOutput<T> {
  result: T
  /**
   * Cache dependency keys to invalidate AFTER the transaction commits.
   * Use CacheDependency helpers to construct these keys.
   *
   * Example:
   * cacheInvalidations: [
   *   CacheDependency.customerSubscriptions(customerId),
   *   CacheDependency.subscriptionItems(subscriptionId),
   * ]
   */
  cacheInvalidations?: CacheDependencyKey[]
}
