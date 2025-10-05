'use client'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import { PageHeader } from '@/components/ui/page-header'
import { PurchasesDataTable } from './data-table'

const InnerPurchasesPage = ({
  organizationId,
}: {
  organizationId: string
}) => {
  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <PageHeader title="Purchases" className="mb-6" />
      </div>
      <PurchasesDataTable filters={{ organizationId }} />
    </InternalPageContainer>
  )
}

export default InnerPurchasesPage
