import { Customer } from '@/db/schema/customers'
import { Purchase } from '@/db/schema/purchases'
import { Payment } from '@/db/schema/payments'
import { InvoiceWithLineItems } from '@/db/schema/invoiceLineItems'
import PurchasesTable from './PurchasesTable'
import InvoicesTable from '@/components/InvoicesTable'
import core from '@/utils/core'
import { CurrencyCode } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import SubscriptionsTable from '@/app/finance/subscriptions/SubscriptionsTable'
import TableTitle from '@/components/ion/TableTitle'
import { Plus } from 'lucide-react'
import CreateInvoiceModal from '@/components/forms/CreateInvoiceModal'
import { useState } from 'react'
import PaymentsTable from '@/app/finance/payments/PaymentsTable'

export interface CustomerBillingSubPageProps {
  customer: Customer.ClientRecord
  purchases: Purchase.ClientRecord[]
  invoices: InvoiceWithLineItems[]
  payments: Payment.ClientRecord[]
}

export function CustomerDetailsItem({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="w-fit flex flex-col gap-0.5">
      <div className="text-xs font-medium text-secondary">
        {label}
      </div>
      <div className="text-sm font-semibold text-on-primary-hover">
        {value}
      </div>
    </div>
  )
}

export const CustomerBillingSubPage = ({
  customer,
  purchases,
  invoices,
  payments,
}: CustomerBillingSubPageProps) => {
  const [createInvoiceModalOpen, setCreateInvoiceModalOpen] =
    useState(false)

  return (
    <>
      <div className="w-full flex items-start">
        <div className="w-full flex flex-col gap-20">
          <div className="w-full min-w-40 flex flex-col gap-4 py-5 pr-5 rounded-radius-sm">
            <div className="text-xl font-semibold text-on-primary-hover">
              Details
            </div>
            <div className="w-fit flex items-start gap-16">
              <CustomerDetailsItem
                label="Customer Since"
                value={core.formatDate(customer.createdAt)}
              />
              <CustomerDetailsItem
                label="Total Spend"
                value={stripeCurrencyAmountToHumanReadableCurrencyAmount(
                  payments[0]?.currency ?? CurrencyCode.USD,
                  payments.reduce(
                    (acc, payment) => acc + payment.amount,
                    0
                  )
                )}
              />
              <CustomerDetailsItem
                label="Email"
                value={customer.email}
              />
            </div>
          </div>
          <div className="w-full flex flex-col gap-5 pb-20">
            <TableTitle title="Subscriptions" noButtons />
            <SubscriptionsTable
              filters={{
                customerId: customer.id,
              }}
            />
            <TableTitle
              title="Invoices"
              buttonLabel="Create Invoice"
              buttonIcon={<Plus size={16} />}
              buttonOnClick={() => setCreateInvoiceModalOpen(true)}
            />
            <InvoicesTable customer={customer} />
            <TableTitle title="Payments" noButtons />
            <PaymentsTable
              filters={{
                customerId: customer.id,
              }}
            />
            <TableTitle title="Purchases" noButtons />
            <PurchasesTable
              filters={{
                customerId: customer.id,
              }}
            />
          </div>
        </div>
      </div>
      <CreateInvoiceModal
        isOpen={createInvoiceModalOpen}
        setIsOpen={setCreateInvoiceModalOpen}
        customer={customer}
      />
    </>
  )
}
