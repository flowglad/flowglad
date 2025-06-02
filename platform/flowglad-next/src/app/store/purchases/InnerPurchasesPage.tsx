'use client'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import PageTitle from '@/components/ion/PageTitle'
import PurchasesTable from '@/app/customers/[id]/PurchasesTable'

const InnerPurchasesPage = ({
  organizationId,
}: {
  organizationId: string
}) => {
  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <div className="flex flex-row justify-between items-center mb-6 gap-8">
          <PageTitle>Purchases</PageTitle>
        </div>
      </div>
      <PurchasesTable />
    </InternalPageContainer>
  )
}

export default InnerPurchasesPage
