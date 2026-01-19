import { notFound } from 'next/navigation'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPaymentsAndPaymentMethodsByPaymentsWhere } from '@/db/tableMethods/paymentMethods'
import type { InvoiceTemplateProps } from '@/pdf-generation/invoices'
import { fetchDiscountInfoForInvoice } from '@/utils/discountHelpers'

export const CustomerFacingInvoicePage = (
  InnerComponent: React.FC<InvoiceTemplateProps>
) => {
  const InvoicePage = async ({
    params,
  }: {
    params: Promise<{ invoiceId: string; organizationId: string }>
  }) => {
    const { invoiceId, organizationId } = await params
    const result = (
      await adminTransaction(async ({ transaction }) => {
        const invoicesWithLineItems =
          await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
            { id: invoiceId },
            transaction
          )

        if (invoicesWithLineItems.length === 0) {
          return null
        }
        const customer = await selectCustomerById(
          invoicesWithLineItems[0].invoice.customerId,
          transaction
        )
        const organization = await selectOrganizationById(
          invoicesWithLineItems[0].invoice.organizationId,
          transaction
        )
        const payments =
          await selectPaymentsAndPaymentMethodsByPaymentsWhere(
            { invoiceId: invoiceId },
            transaction
          )

        // Fetch discount information if there's a billing period
        const invoice = invoicesWithLineItems[0].invoice
        const discountInfo =
          await fetchDiscountInfoForInvoice(invoice)

        return {
          invoice: invoice,
          invoiceLineItems: invoicesWithLineItems[0].invoiceLineItems,
          customer: customer,
          organization: organization,
          payments,
          discountInfo,
        }
      })
    ).unwrap()

    if (!result) {
      notFound()
    }
    const {
      invoice,
      invoiceLineItems,
      customer,
      organization,
      payments,
      discountInfo,
    } = result
    if (invoice.organizationId !== organizationId) {
      return notFound()
    }
    return (
      <InnerComponent
        invoice={invoice}
        invoiceLineItems={invoiceLineItems}
        customer={customer}
        organization={organization}
        paymentDataItems={payments}
        discountInfo={discountInfo}
      />
    )
  }
  InvoicePage.displayName = InnerComponent.displayName
  return InvoicePage
}
