import type { CacheDependencyKey } from '@/utils/cache'
import type { LedgerCommand } from './ledgerManager/ledgerManagerTypes'
import type { Event } from './schema/events'

// Unified output structure for functions running within our transactions
export interface TransactionOutput<T> {
  result: T
  eventsToInsert?: Event.Insert[]
  ledgerCommands?: LedgerCommand[]
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
