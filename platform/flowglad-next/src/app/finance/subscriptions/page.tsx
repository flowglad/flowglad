'use client'

import SubscriptionsTable, {
  SubscriptionsTableFilters,
} from './SubscriptionsTable'
import { SubscriptionStatus } from '@/types'
import InternalPageContainer from '@/components/InternalPageContainer'
import { trpc } from '@/app/_trpc/client'
import { useState } from 'react'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import { PageHeader } from '@/components/ui/page-header'

function InternalSubscriptionsPage() {
  const [activeTab, setActiveTab] = useState<string>('all')

  const { data: countsData } =
    trpc.subscriptions.getCountsByStatus.useQuery({})

  const countsByStatus = countsData || []
  const countsByStatusMap = new Map(
    countsByStatus.map((item) => [item.status, item.count])
  )

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

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="gap-8 border-b border-muted">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value={SubscriptionStatus.Active}>
              Active
            </TabsTrigger>
            <TabsTrigger value={SubscriptionStatus.Trialing}>
              Trialing
            </TabsTrigger>
            <TabsTrigger value={SubscriptionStatus.Canceled}>
              Canceled
            </TabsTrigger>
            <TabsTrigger value={SubscriptionStatus.Paused}>
              Paused
            </TabsTrigger>
            <TabsTrigger value={SubscriptionStatus.PastDue}>
              Past Due
            </TabsTrigger>
            <TabsTrigger value={SubscriptionStatus.Incomplete}>
              Incomplete
            </TabsTrigger>
          </TabsList>
          <TabsContent value={activeTab} className="mt-6">
            <SubscriptionsTable
              filters={getFilterForTab(activeTab)}
            />
          </TabsContent>
        </Tabs>
      </div>
    </InternalPageContainer>
  )
}

export default InternalSubscriptionsPage
