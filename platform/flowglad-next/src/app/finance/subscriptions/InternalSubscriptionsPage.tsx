'use client'

import { PageHeader } from '@/components/ion/PageHeader'
import { Subscription } from '@/db/schema/subscriptions'
import SubscriptionsTable, {
  SubscriptionsTableFilters,
} from './SubscriptionsTable'
import { SubscriptionStatus } from '@/types'
import InternalPageContainer from '@/components/InternalPageContainer'
import { trpc } from '@/app/_trpc/client'
import { useState } from 'react'
import { Tabs, TabsContent, TabsList } from '@/components/ion/Tab'
import Badge from '@/components/ion/Badge'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import PageTitle from '@/components/ion/PageTitle'
import { SubscriptionsTab } from './components/SubscriptionsTab'

interface InternalSubscriptionsPageProps {
  subscriptions: Subscription.TableRowData[]
}

const InternalSubscriptionsPage = ({
  subscriptions: initialSubscriptions,
}: InternalSubscriptionsPageProps) => {
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
        <div className="flex flex-row justify-between">
          <PageTitle>Subscriptions</PageTitle>
        </div>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="mb-4">
            <SubscriptionsTab
              status="all"
              isActive={activeTab === 'all'}
            />
            <SubscriptionsTab
              status={SubscriptionStatus.Active}
              isActive={activeTab === SubscriptionStatus.Active}
            />
            <SubscriptionsTab
              status={SubscriptionStatus.Trialing}
              isActive={activeTab === SubscriptionStatus.Trialing}
            />
            <SubscriptionsTab
              status={SubscriptionStatus.Canceled}
              isActive={activeTab === SubscriptionStatus.Canceled}
            />
          </TabsList>

          <TabsContent value="all">
            <SubscriptionsTable filters={getFilterForTab('all')} />
          </TabsContent>

          <TabsContent value={SubscriptionStatus.Active}>
            <SubscriptionsTable
              filters={getFilterForTab(SubscriptionStatus.Active)}
            />
          </TabsContent>

          <TabsContent value={SubscriptionStatus.Trialing}>
            <SubscriptionsTable
              filters={getFilterForTab(SubscriptionStatus.Trialing)}
            />
          </TabsContent>

          <TabsContent value={SubscriptionStatus.Canceled}>
            <SubscriptionsTable
              filters={getFilterForTab(SubscriptionStatus.Canceled)}
            />
          </TabsContent>
        </Tabs>
      </div>
    </InternalPageContainer>
  )
}

export default InternalSubscriptionsPage
