// Generated with Ion on 10/10/2024, 7:03:48 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=727:33232
'use client'
import { PageHeader } from '@/components/ion/PageHeader'
import { Customer } from '@/db/schema/customers'
import { CustomerProfile } from '@/db/schema/customerProfiles'
import { Purchase } from '@/db/schema/purchases'
import { Payment } from '@/db/schema/payments'
import { InvoiceWithLineItems } from '@/db/schema/invoiceLineItems'
import { CustomerBillingSubPage } from './CustomerDetailsBillingTab'
import { Price } from '@/db/schema/prices'

function InternalCustomerDetailsScreen({
  customerProfile,
  purchases,
  invoices,
  payments,
}: {
  customerProfile: CustomerProfile.ClientRecord
  purchases: Purchase.ClientRecord[]
  invoices: InvoiceWithLineItems[]
  payments: Payment.ClientRecord[]
  prices: Price.ClientRecord[]
}) {
  return (
    <div className="h-full flex justify-between items-center gap-2.5">
      <div className="bg-internal flex-1 h-full w-full flex flex-col p-6">
        <PageHeader
          title={customerProfile.name ?? ''}
          tabs={[
            {
              label: 'Billing',
              subPath: 'billing',
              Component: () => (
                <CustomerBillingSubPage
                  customerProfile={customerProfile}
                  purchases={purchases}
                  invoices={invoices}
                  payments={payments}
                />
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}

export default InternalCustomerDetailsScreen
