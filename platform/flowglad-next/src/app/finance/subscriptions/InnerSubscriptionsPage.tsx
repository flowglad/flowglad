'use client'

import PageContainer from '@/components/PageContainer'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { SubscriptionsDataTable } from './data-table'

function InnerSubscriptionsPage() {
  return (
    <PageContainer>
      <PageHeaderNew
        title="Subscriptions"
        hideBorder
        className="pb-2"
      />
      {/* TODO: Remove useMockData once testing is complete */}
      <SubscriptionsDataTable hiddenColumns={['id']} useMockData />
    </PageContainer>
  )
}

export default InnerSubscriptionsPage
