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
import { Variant } from '@/db/schema/variants'

function InternalCustomerDetailsScreen({
  customer,
  customerProfile,
  purchases,
  invoices,
  payments,
}: {
  customer: Customer.ClientRecord
  customerProfile: CustomerProfile.ClientRecord
  purchases: Purchase.ClientRecord[]
  invoices: InvoiceWithLineItems[]
  payments: Payment.ClientRecord[]
  variants: Variant.ClientRecord[]
}) {
  return (
    <div className="h-full flex justify-between items-center gap-2.5">
      <div className="bg-internal flex-1 h-full w-full flex flex-col p-6">
        <PageHeader
          title={customer.name}
          tabs={[
            {
              label: 'Billing',
              subPath: 'billing',
              Component: () => (
                <CustomerBillingSubPage
                  customer={customer}
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
