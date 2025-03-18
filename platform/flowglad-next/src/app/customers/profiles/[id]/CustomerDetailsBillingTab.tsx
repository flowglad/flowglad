import { Customer } from '@/db/schema/customers'
import { CustomerProfile } from '@/db/schema/customerProfiles'
import { Purchase } from '@/db/schema/purchases'
import { Payment } from '@/db/schema/payments'
import { InvoiceWithLineItems } from '@/db/schema/invoiceLineItems'
import PurchasesTable from './PurchasesTable'
import InvoicesTable from '@/components/InvoicesTable'
import core from '@/utils/core'
import { CurrencyCode } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

export interface CustomerBillingSubPageProps {
  customerProfile: CustomerProfile.ClientRecord
  purchases: Purchase.ClientRecord[]
  invoices: InvoiceWithLineItems[]
  payments: Payment.ClientRecord[]
}

export const CustomerBillingSubPage = ({
  customerProfile,
  purchases,
  invoices,
  payments,
}: CustomerBillingSubPageProps) => {
  return (
    <>
      <div className="w-full flex items-start">
        <div className="w-full flex flex-col gap-20">
          <div className="w-full min-w-40 flex flex-col gap-4 py-5 pr-5 rounded-radius-sm">
            <div className="text-xl font-semibold text-on-primary-hover">
              Details
            </div>
            <div className="w-fit flex items-start gap-16">
              <div className="w-fit flex flex-col gap-0.5">
                <div className="text-xs font-medium text-secondary">
                  Customer Since
                </div>
                <div className="text-sm font-semibold text-on-primary-hover">
                  {core.formatDate(customerProfile.createdAt)}
                </div>
              </div>
              <div className="w-fit flex flex-col gap-0.5">
                <div className="text-xs font-medium text-secondary">
                  Total Spend
                </div>
                <div className="text-sm font-semibold text-on-primary-hover">
                  $
                  {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                    payments[0]?.currency ?? CurrencyCode.USD,
                    payments.reduce(
                      (acc, payment) => acc + payment.amount,
                      0
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
          <PurchasesTable purchases={purchases} payments={payments} />
          <InvoicesTable
            invoicesAndLineItems={invoices}
            customerProfile={customerProfile}
          />
        </div>
      </div>
    </>
  )
}
