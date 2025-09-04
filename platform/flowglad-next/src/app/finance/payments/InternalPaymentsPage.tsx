'use client'

import { useState } from 'react'
import PaymentsTable from './PaymentsTable'
import { PaymentStatus } from '@/types'
import { Tabs, TabsList, TabsContent } from '@/components/ui/tabs'
import { PaymentsTab } from './components/PaymentsTab'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import InternalPageContainer from '@/components/InternalPageContainer'
import { PageHeader } from '@/components/ui/page-header'

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
          <PageHeader title="Payments" />
        </div>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="gap-8 border-b border-muted">
            <PaymentsTab status="all" />
            <PaymentsTab status={PaymentStatus.Succeeded} />
            <PaymentsTab status={PaymentStatus.Processing} />
            <PaymentsTab status={PaymentStatus.Refunded} />
            <PaymentsTab status={PaymentStatus.Canceled} />
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            <PaymentsTable filters={getFiltersForTab(activeTab)} />
          </TabsContent>
        </Tabs>
      </div>
    </InternalPageContainer>
  )
}
