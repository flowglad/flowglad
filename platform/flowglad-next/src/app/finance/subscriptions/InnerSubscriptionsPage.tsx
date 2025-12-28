'use client'

import InnerPageContainerNew from '@/components/InnerPageContainerNew'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { SubscriptionsDataTable } from './data-table'

function InnerSubscriptionsPage() {
  return (
    <InnerPageContainerNew>
      <PageHeaderNew
        title="Subscriptions"
        hideBorder
        className="pb-2"
      />
      <SubscriptionsDataTable hiddenColumns={['id']} />
    </InnerPageContainerNew>
  )
}

export default InnerSubscriptionsPage
