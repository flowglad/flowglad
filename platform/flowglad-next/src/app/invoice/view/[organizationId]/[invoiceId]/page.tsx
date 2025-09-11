import { InvoiceTemplateProps } from '@/pdf-generation/invoices'
import { CustomerFacingInvoicePage } from './CustomerFacingInvoicePage'
import core from '@/utils/core'
import {
  getPaymentIntent,
  stripeCurrencyAmountToHumanReadableCurrencyAmount,
} from '@/utils/stripe'
import { CheckoutFlowType, InvoiceStatus } from '@/types'
import {
  CustomerInvoiceDownloadReceiptButtonBanner,
  CustomerInvoicePayButtonBanner,
} from './CustomerInvoiceButtonBanner'
import { CheckoutInfoCore } from '@/db/tableMethods/purchaseMethods'
import { adminTransaction } from '@/db/adminTransaction'
import { findOrCreateInvoiceCheckoutSession } from '@/utils/checkoutSessionState'

const CustomerInvoicePaidView = (props: InvoiceTemplateProps) => {
  const { invoice, invoiceLineItems } = props
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-secondary p-4">
      <div className="bg-card rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-primary text-2xl font-bold mb-2">
            Invoice Paid
          </h1>
          <p className="text-4xl font-bold">
            {stripeCurrencyAmountToHumanReadableCurrencyAmount(
              invoice.currency,
              invoiceLineItems.reduce(
                (acc, item) => acc + item.price * item.quantity,
                0
              )
            )}
          </p>
        </div>

        <div className="space-y-4 mb-8">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Invoice number
            </span>
            <span className="font-medium">
              #{invoice.invoiceNumber}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Payment date
            </span>
            <span className="font-medium">
              {core.formatDate(invoice.createdAt)}
            </span>
          </div>
        </div>
        <CustomerInvoiceDownloadReceiptButtonBanner
          invoice={invoice}
        />
      </div>
    </div>
  )
}

const CustomerInvoiceOpenView = async (
  props: InvoiceTemplateProps
) => {
  const { invoice, invoiceLineItems, customer, organization } = props
  const checkoutSession = await adminTransaction(
    async ({ transaction }) => {
      return findOrCreateInvoiceCheckoutSession(
        {
          invoice,
          invoiceLineItems,
        },
        transaction
      )
    }
  )

  let clientSecret: string | null = null
  if (checkoutSession.stripePaymentIntentId) {
    const paymentIntent = await getPaymentIntent(
      checkoutSession.stripePaymentIntentId
    )
    clientSecret = paymentIntent.client_secret
  }

  const checkoutInfo: CheckoutInfoCore = {
    customer,
    sellerOrganization: organization,
    flowType: CheckoutFlowType.Invoice,
    invoice,
    invoiceLineItems,
    feeCalculation: null,
    clientSecret,
    readonlyCustomerEmail: customer.email,
    redirectUrl: core.safeUrl(
      `/invoice/view/${organization.id}/${invoice.id}`,
      core.envVariable('NEXT_PUBLIC_APP_URL')
    ),
    checkoutSession,
  }
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-secondary p-4">
      <div className="bg-card rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="mb-8">
          <p className="text-4xl font-bold mb-1">
            {stripeCurrencyAmountToHumanReadableCurrencyAmount(
              invoice.currency,
              invoiceLineItems.reduce(
                (acc, item) => acc + item.price * item.quantity,
                0
              )
            )}
          </p>
          <p className="text-muted-foreground">
            Due{' '}
            {core.formatDate(invoice.dueDate || invoice.createdAt)}
          </p>
        </div>

        <div className="space-y-4 mb-8">
          <div className="flex flex-col">
            <span className="text-muted-foreground text-sm">To</span>
            <span className="font-medium">{customer.name}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground text-sm">
              From
            </span>
            <span className="font-medium">{organization.name}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground text-sm">
              Invoice
            </span>
            <span className="font-medium">
              #{invoice.invoiceNumber}
            </span>
          </div>
        </div>
        <CustomerInvoicePayButtonBanner
          invoice={invoice}
          checkoutInfo={checkoutInfo}
        />
      </div>
    </div>
  )
}

const CustomerInvoiceView = (props: InvoiceTemplateProps) => {
  const { invoice, invoiceLineItems } = props
  if (invoice.status === InvoiceStatus.Paid) {
    return (
      <CustomerInvoicePaidView
        invoice={invoice}
        invoiceLineItems={invoiceLineItems}
        customer={props.customer}
        organization={props.organization}
      />
    )
  }

  return (
    // @ts-ignore - async component
    <CustomerInvoiceOpenView
      invoice={invoice}
      invoiceLineItems={invoiceLineItems}
      customer={props.customer}
      organization={props.organization}
    />
  )
}

const CustomerInvoiceViewPage = CustomerFacingInvoicePage(
  CustomerInvoiceView
)

export default CustomerInvoiceViewPage
