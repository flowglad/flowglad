'use client'

import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import { PageHeader } from '@/components/ui/page-header'
import { SubscriptionsDataTable } from './data-table'

function InternalSubscriptionsPage() {
  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <PageHeader title="Subscriptions" />
        <div>
          <SubscriptionsDataTable />
        </div>
      </div>
    </InternalPageContainer>
  )
}

export default InternalSubscriptionsPage
