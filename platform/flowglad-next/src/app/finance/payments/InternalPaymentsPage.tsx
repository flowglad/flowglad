'use client'

import { useState } from 'react'
import PaymentsTable from './PaymentsTable'
import { PaymentStatus } from '@/types'
import { Tabs, TabsList, TabsContent } from '@/components/ion/Tab'
import { PaymentsTab } from './components/PaymentsTab'

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
    <div className="h-full flex flex-col">
      <div className="flex-1 h-full w-full flex flex-col p-6">
        <h1 className="text-2xl font-semibold mb-6">Payments</h1>

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
    </div>
  )
}
