import { Customer } from '@/db/schema/customers'
import { Purchase } from '@/db/schema/purchases'
import { Payment } from '@/db/schema/payments'
import { InvoiceWithLineItems } from '@/db/schema/invoiceLineItems'
import PurchasesTable from './PurchasesTable'
import InvoicesTable from '@/components/InvoicesTable'
import core from '@/utils/core'
import { CurrencyCode, PaymentStatus } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import SubscriptionsTable from '@/app/finance/subscriptions/SubscriptionsTable'
import TableTitle from '@/components/ion/TableTitle'
import { Plus } from 'lucide-react'
import CreateInvoiceModal from '@/components/forms/CreateInvoiceModal'
import { useState } from 'react'
import PaymentsTable from '@/app/finance/payments/PaymentsTable'
import { DetailLabel } from '@/components/DetailLabel'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'

const CustomerDetailsSection = ({
  customer,
  payments,
}: {
  customer: Customer.ClientRecord
  payments: Payment.ClientRecord[]
}) => {
  const billingPortalURL = core.billingPortalPageURL({
    organizationId: customer.organizationId,
    customerExternalId: customer.externalId,
    page: 'manage',
  })

  return (
    <div className="w-full min-w-40 flex flex-col gap-4 py-5 pr-5 rounded-radius-sm">
      <div className="text-xl font-semibold text-on-primary-hover">
        Details
      </div>
      <div className="grid grid-cols-2 gap-x-16 gap-y-4">
        <div className="flex flex-col gap-4">
          <DetailLabel
            label="Email"
            value={
              <CopyableTextTableCell copyText={customer.email}>
                {customer.email}
              </CopyableTextTableCell>
            }
          />
          <DetailLabel
            label="ID"
            value={
              <CopyableTextTableCell copyText={customer.id}>
                {customer.id}
              </CopyableTextTableCell>
            }
          />
          <DetailLabel
            label="External ID"
            value={
              <CopyableTextTableCell copyText={customer.externalId}>
                {customer.externalId}
              </CopyableTextTableCell>
            }
          />
        </div>
        <div className="flex flex-col gap-4">
          <DetailLabel
            label="Customer Since"
            value={core.formatDate(customer.createdAt)}
          />
          <DetailLabel
            label="Portal URL"
            value={
              <CopyableTextTableCell
                copyText={billingPortalURL}
                className="max-w-72"
              >
                {billingPortalURL}
              </CopyableTextTableCell>
            }
          />
          <DetailLabel
            label="Total Spend"
            value={stripeCurrencyAmountToHumanReadableCurrencyAmount(
              payments[0]?.currency ?? CurrencyCode.USD,
              payments
                .filter(
                  (payment) =>
                    payment.status === PaymentStatus.Succeeded ||
                    payment.status === PaymentStatus.Processing
                )
                .reduce((acc, payment) => acc + payment.amount, 0)
            )}
          />
        </div>
      </div>
    </div>
  )
}
export interface CustomerBillingSubPageProps {
  customer: Customer.ClientRecord
  purchases: Purchase.ClientRecord[]
  invoices: InvoiceWithLineItems[]
  payments: Payment.ClientRecord[]
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
          <CustomerDetailsSection
            customer={customer}
            payments={payments}
          />
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
