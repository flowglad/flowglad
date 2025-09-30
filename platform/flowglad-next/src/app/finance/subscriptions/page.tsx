'use client'

import {
  SubscriptionsDataTable,
  SubscriptionsTableFilters,
} from './data-table'
import { SubscriptionStatus } from '@/types'
import InternalPageContainer from '@/components/InternalPageContainer'
import { trpc } from '@/app/_trpc/client'
import { useState } from 'react'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import { PageHeader } from '@/components/ui/page-header'

function InternalSubscriptionsPage() {
  const [activeFilter, setActiveFilter] = useState<string>('all')

  const { data: countsData } =
    trpc.subscriptions.getCountsByStatus.useQuery({})

  const countsByStatus = countsData || []
  const countsByStatusMap = new Map(
    countsByStatus.map((item) => [item.status, item.count])
  )

  // Filter options for the button group
  const filterOptions = [
    { value: 'all', label: 'All' },
    { value: SubscriptionStatus.Active, label: 'Active' },
    { value: SubscriptionStatus.Trialing, label: 'Trialing' },
    { value: SubscriptionStatus.Canceled, label: 'Canceled' },
    { value: SubscriptionStatus.Paused, label: 'Paused' },
    { value: SubscriptionStatus.PastDue, label: 'Past Due' },
    { value: SubscriptionStatus.Incomplete, label: 'Incomplete' },
  ]

  const getFilterForTab = (
    tab: string
  ): SubscriptionsTableFilters => {
    if (tab === 'all') {
      return {}
    }

    return {
      status: tab as SubscriptionStatus,
    }
  }

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <PageHeader title="Subscriptions" />

        <div className="w-full">
          <SubscriptionsDataTable
            filters={getFilterForTab(activeFilter)}
            filterOptions={filterOptions}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
          />
        </div>
      </div>
    </InternalPageContainer>
  )
}

export default InternalSubscriptionsPage
