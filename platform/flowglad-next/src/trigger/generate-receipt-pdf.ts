import cloudflareMethods from '@/utils/cloudflare'
import core from '@/utils/core'
import { task } from '@trigger.dev/sdk'
import { generatePdf } from '@/pdf-generation/generatePDF'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectInvoiceById,
  updateInvoice,
} from '@/db/tableMethods/invoiceMethods'
import {
  selectPaymentById,
  updatePayment,
} from '@/db/tableMethods/paymentMethods'

export const generatePaymentReceiptPdfTask = task({
  id: 'generate-payment-receipt-pdf',
  run: async ({ paymentId }: { paymentId: string }, { ctx }) => {
    const { payment, invoice } = await adminTransaction(
      async ({ transaction }) => {
        const payment = await selectPaymentById(
          paymentId,
          transaction
        )
        const invoice = payment.invoiceId
          ? await selectInvoiceById(payment.invoiceId, transaction)
          : null
        return { payment, invoice }
      }
    )
    if (!invoice) {
      return {
        message: `Invoice not found for payment: ${payment.id}`,
        payment,
      }
    }
    /**
     * In dev mode, trigger will not load localhost:3000 correctly,
     * probably because it's running inside of a container.
     * So we use staging.flowglad.com as the base URL
     */
    const urlBase = core.IS_DEV
      ? 'https://staging.flowglad.com'
      : core.NEXT_PUBLIC_APP_URL
    const invoiceUrl = core.safeUrl(
      `/invoice/view/${payment.organizationId}/${invoice.id}/receipt-pdf-preview`,
      urlBase
    )
    const key = `receipts/${payment.organizationId}/${payment.id}/receipt_${core.nanoid()}.pdf`
    await generatePdf({ url: invoiceUrl, bucketKey: key })
    const receiptURL = core.safeUrl(
      key,
      cloudflareMethods.BUCKET_PUBLIC_URL
    )
    await adminTransaction(async ({ transaction }) => {
      if (invoice) {
        await updateInvoice(
          {
            ...invoice,
            receiptPdfURL: receiptURL,
          },
          transaction
        )
      }
      return updatePayment(
        {
          id: payment.id,
          receiptURL,
        },
        transaction
      )
    })

    return {
      message: `Receipt PDF generated successfully: ${payment.id}`,
      url: receiptURL,
    }
  },
})

export const generatePaymentReceiptPdfIdempotently = async (
  paymentId: string
) => {
  return await generatePaymentReceiptPdfTask.trigger(
    { paymentId },
    {
      idempotencyKey: paymentId,
    }
  )
}
