'use client'

import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import {
  SubscriptionItemsDataTable,
  SubscriptionItemsTableFilters,
} from './data-table'

// Backward compatibility wrapper - maintains same interface for existing imports
const SubscriptionItemsTable = ({
  subscriptionItems,
  loading = false,
}: {
  subscriptionItems: SubscriptionItem.ClientRecord[]
  loading?: boolean
}) => {
  return (
    <SubscriptionItemsDataTable
      subscriptionItems={subscriptionItems}
      loading={loading}
    />
  )
}

// Re-export interface and new component for direct use
export type { SubscriptionItemsTableFilters }
export { SubscriptionItemsDataTable }

export default SubscriptionItemsTable
