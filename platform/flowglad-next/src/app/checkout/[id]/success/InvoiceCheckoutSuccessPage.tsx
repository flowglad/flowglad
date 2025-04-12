import { adminTransaction } from '@/db/adminTransaction'
import { selectInvoiceById } from '@/db/tableMethods/invoiceMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import SuccessPageContainer from '@/components/SuccessPageContainer'

interface InvoiceCheckoutSuccessPageProps {
  invoice: CheckoutSession.Record
}

const InvoiceCheckoutSuccessPage = async ({
  invoice,
}: InvoiceCheckoutSuccessPageProps) => {
  // Get the invoice details to display the organization name
  const invoiceDetails = await adminTransaction(
    async ({ transaction }) => {
      if (!invoice.invoiceId) {
        return { organizationName: 'the organization' }
      }

      const invoiceRecord = await selectInvoiceById(
        invoice.invoiceId,
        transaction
      )
      const organization = await selectOrganizationById(
        invoiceRecord.organizationId,
        transaction
      )
      return { organizationName: organization.name }
    }
  )

  return (
    <SuccessPageContainer
      title="Invoice Payment Successful"
      message={`Thank you for your payment to ${invoiceDetails.organizationName}. Your invoice has been paid successfully.`}
    />
  )
}

export default InvoiceCheckoutSuccessPage
