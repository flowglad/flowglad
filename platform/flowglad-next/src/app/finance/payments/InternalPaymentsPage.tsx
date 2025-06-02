'use client'

import { useState } from 'react'
import PaymentsTable from './PaymentsTable'
import { PaymentStatus } from '@/types'
import { Tabs, TabsList, TabsContent } from '@/components/ion/Tab'
import { PaymentsTab } from './components/PaymentsTab'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import InternalPageContainer from '@/components/InternalPageContainer'
import PageTitle from '@/components/ion/PageTitle'

export default function InternalPaymentsPage() {
  const [activeTab, setActiveTab] = useState<string>('all')

  const getFiltersForTab = (tab: string) => {
    if (tab === 'all') {
      return {}
    }

    return {
      status: tab as PaymentStatus,
    }
  }

  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <div className="flex flex-row justify-between">
          <PageTitle>Payments</PageTitle>
        </div>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="mb-4">
            <PaymentsTab
              status="all"
              isActive={activeTab === 'all'}
            />
            <PaymentsTab
              status={PaymentStatus.Succeeded}
              isActive={activeTab === PaymentStatus.Succeeded}
            />
            <PaymentsTab
              status={PaymentStatus.Processing}
              isActive={activeTab === PaymentStatus.Processing}
            />
            <PaymentsTab
              status={PaymentStatus.Refunded}
              isActive={activeTab === PaymentStatus.Refunded}
            />
            <PaymentsTab
              status={PaymentStatus.Canceled}
              isActive={activeTab === PaymentStatus.Canceled}
            />
          </TabsList>

          <TabsContent value={activeTab}>
            <PaymentsTable filters={getFiltersForTab(activeTab)} />
          </TabsContent>
        </Tabs>
      </div>
    </InternalPageContainer>
  )
}
