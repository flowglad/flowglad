import { adminTransaction } from '@/db/databaseMethods'
import { selectCustomerProfileById } from '@/db/tableMethods/customerProfileMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { notFound } from 'next/navigation'
import { InvoiceTemplateProps } from '@/pdf-generation/invoices'
import { selectPaymentsAndPaymentMethodsByPaymentsWhere } from '@/db/tableMethods/paymentMethods'

export const CustomerFacingInvoicePage = (
  InnerComponent: React.FC<InvoiceTemplateProps>
) => {
  const InvoicePage = async ({
    params,
  }: {
    params: { invoiceId: string; organizationId: string }
  }) => {
    const { invoiceId, organizationId } = await params
    const result = await adminTransaction(async ({ transaction }) => {
      const invoicesWithLineItems =
        await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
          { id: invoiceId },
          transaction
        )

      if (invoicesWithLineItems.length === 0) {
        return null
      }
      const customerProfile = await selectCustomerProfileById(
        invoicesWithLineItems[0].CustomerProfileId,
        transaction
      )
      const organization = await selectOrganizationById(
        invoicesWithLineItems[0].OrganizationId,
        transaction
      )
      const payments =
        await selectPaymentsAndPaymentMethodsByPaymentsWhere(
          { InvoiceId: invoiceId },
          transaction
        )
      return {
        invoice: invoicesWithLineItems[0],
        invoiceLineItems: invoicesWithLineItems[0].invoiceLineItems,
        customerProfile: customerProfile,
        organization: organization,
        payments,
      }
    })

    if (!result) {
      notFound()
    }
    const {
      invoice,
      invoiceLineItems,
      customerProfile,
      organization,
      payments,
    } = result
    if (result.invoice.OrganizationId !== organizationId) {
      return notFound()
    }
    return (
      <InnerComponent
        invoice={invoice}
        invoiceLineItems={invoiceLineItems}
        customerProfile={customerProfile}
        organization={organization}
        paymentDataItems={payments}
      />
    )
  }
  InvoicePage.displayName = InnerComponent.displayName
  return InvoicePage
}
