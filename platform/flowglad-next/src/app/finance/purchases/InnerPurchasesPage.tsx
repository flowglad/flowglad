'use client'

import PageContainer from '@/components/PageContainer'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { PurchasesDataTable } from './data-table'

const InnerPurchasesPage = () => {
  return (
    <PageContainer>
      <PageHeaderNew title="Purchases" hideBorder className="pb-2" />
      <PurchasesDataTable hiddenColumns={['id', 'customer']} />
    </PageContainer>
  )
}

export default InnerPurchasesPage
