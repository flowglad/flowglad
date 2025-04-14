'use client'
import { PageHeader } from '@/components/ion/PageHeader'
import PurchasesTable from '@/app/customers/[id]/PurchasesTable'

const InnerPurchasesPage = ({
  organizationId,
}: {
  organizationId: string
}) => {
  return (
    <div className="h-full flex justify-between items-center gap-2.5">
      <div className="bg-internal flex-1 h-full w-full flex flex-col p-6">
        <PageHeader
          title="Purchases"
          tabs={[
            {
              label: 'All',
              subPath: '',
              Component: () => <PurchasesTable />,
            },
          ]}
          hideTabs
        />
      </div>
    </div>
  )
}

export default InnerPurchasesPage
