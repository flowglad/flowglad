import { Customer } from '@/db/schema/customers'
import { Purchase } from '@/db/schema/purchases'
import { Payment } from '@/db/schema/payments'
import { InvoiceWithLineItems } from '@/db/schema/invoiceLineItems'
import { UsageEvent } from '@/db/schema/usageEvents'
import PurchasesTable from './PurchasesTable'
import UsageEventsTable from './UsageEventsTable'
import InvoicesTable from '@/components/InvoicesTable'
import core from '@/utils/core'
import { CurrencyCode, PaymentStatus } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { SubscriptionsDataTable } from '@/app/finance/subscriptions/data-table'
import { TableHeader } from '@/components/ui/table-header'
// import { Plus } from 'lucide-react'
// import CreateInvoiceModal from '@/components/forms/CreateInvoiceModal'
// import { useState } from 'react'
import { PaymentsDataTable } from '@/app/finance/payments/data-table'
import { DetailLabel } from '@/components/DetailLabel'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'

const CustomerDetailsSection = ({
  customer,
  payments,
  usageEvents,
}: {
  customer: Customer.ClientRecord
  payments: Payment.ClientRecord[]
  usageEvents: UsageEvent.ClientRecord[]
}) => {
  const billingPortalURL = core.customerBillingPortalURL({
    organizationId: customer.organizationId,
    customerId: customer.id,
  })

  // Calculate usage events metrics
  const totalUsageEvents = usageEvents.length
  const totalUsageAmount = usageEvents.reduce(
    (sum, event) => sum + event.amount,
    0
  )
  const latestUsageEvent =
    usageEvents.length > 0
      ? usageEvents.reduce((latest, current) =>
          new Date(current.usageDate) > new Date(latest.usageDate)
            ? current
            : latest
        )
      : null

  return (
    <div className="w-full min-w-40 flex flex-col gap-4 py-5 pr-5 rounded-md">
      <div className="text-xl font-semibold text-foreground">
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
        </div>
        <div className="flex flex-col gap-4">
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
          <DetailLabel
            label="Total Usage Events"
            value={totalUsageEvents.toString()}
          />
          <DetailLabel
            label="Total Usage Amount"
            value={totalUsageAmount.toString()}
          />
          <DetailLabel
            label="Latest Usage"
            value={
              latestUsageEvent
                ? core.formatDate(latestUsageEvent.usageDate)
                : 'None'
            }
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
  usageEvents: UsageEvent.ClientRecord[]
}

export const CustomerBillingSubPage = ({
  customer,
  purchases,
  invoices,
  payments,
  usageEvents,
}: CustomerBillingSubPageProps) => {
  // const [createInvoiceModalOpen, setCreateInvoiceModalOpen] =
  //   useState(false)
  return (
    <>
      <div className="w-full flex items-start">
        <div className="w-full flex flex-col gap-20">
          <CustomerDetailsSection
            customer={customer}
            payments={payments}
            usageEvents={usageEvents}
          />
          <div className="w-full flex flex-col gap-5 pb-20">
            <h3 className="text-lg font-semibold">Subscriptions</h3>
            <SubscriptionsDataTable
              filters={{
                customerId: customer.id,
              }}
            />
            <TableHeader
              title="Invoices"
              noButtons
              // buttonLabel="Create Invoice"
              // buttonIcon={<Plus size={16} />}
              // buttonOnClick={() => setCreateInvoiceModalOpen(true)}
            />
            <InvoicesTable customer={customer} />
            <div className="flex flex-col gap-5">
              <h3 className="text-lg font-semibold">Payments</h3>
              <PaymentsDataTable
                filters={{
                  customerId: customer.id,
                }}
              />
            </div>
            <TableHeader title="Purchases" noButtons />
            <PurchasesTable
              filters={{
                customerId: customer.id,
              }}
            />
            <TableHeader title="Usage Events" noButtons />
            <UsageEventsTable
              filters={{
                customerId: customer.id,
              }}
            />
          </div>
        </div>
      </div>
      {/* <CreateInvoiceModal
        isOpen={createInvoiceModalOpen}
        setIsOpen={setCreateInvoiceModalOpen}
        customer={customer}
      /> */}
    </>
  )
}
