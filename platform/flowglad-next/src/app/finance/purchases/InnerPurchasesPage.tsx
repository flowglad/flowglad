'use client'

import InnerPageContainerNew from '@/components/InnerPageContainerNew'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { PurchasesDataTable } from './data-table'

const InnerPurchasesPage = () => {
  return (
    <InnerPageContainerNew>
      <PageHeaderNew title="Purchases" hideBorder className="pb-2" />
      <PurchasesDataTable hiddenColumns={['id', 'status']} />
    </InnerPageContainerNew>
  )
}

export default InnerPurchasesPage
