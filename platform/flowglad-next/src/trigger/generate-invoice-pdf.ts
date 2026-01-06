import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectInvoiceById,
  updateInvoice,
} from '@/db/tableMethods/invoiceMethods'
import { generatePdf } from '@/pdf-generation/generatePDF'
import cloudflareMethods from '@/utils/cloudflare'
import core from '@/utils/core'
import { tracedTaskRun, tracedTrigger } from '@/utils/triggerTracing'

export const generateInvoicePdfTask = task({
  id: 'generate-invoice-pdf',
  run: async ({ invoiceId }: { invoiceId: string }, { ctx }) => {
    return tracedTaskRun(
      'generateInvoicePdf',
      async () => {
        const invoice = await adminTransaction(
          async ({ transaction }) => {
            return await selectInvoiceById(invoiceId, transaction)
          },
          { operationName: 'selectInvoiceForPdfGeneration' }
        )
        /**
         * In dev mode, trigger will not load localhost:3000 correctly,
         * probably because it's running inside of a container.
         * So we use staging.flowglad.com as the base URL
         */
        const urlBase = core.IS_DEV
          ? 'https://staging.flowglad.com'
          : core.NEXT_PUBLIC_APP_URL

        const invoiceUrl = core.safeUrl(
          `/invoice/view/${invoice.organizationId}/${invoice.id}/pdf-preview`,
          urlBase
        )
        logger.log('Invoice URL', { invoiceUrl })
        const key = `invoices/${invoice.organizationId}/${invoice.id}/${core.nanoid()}.pdf`
        logger.log('Key', { key })
        await generatePdf({ url: invoiceUrl, bucketKey: key })
        const invoicePdfUrl = core.safeUrl(
          key,
          cloudflareMethods.BUCKET_PUBLIC_URL
        )
        logger.log('Invoice PDF URL', { invoicePdfUrl })
        const oldInvoicePdfUrl = await adminTransaction(
          async ({ transaction }) => {
            const latestInvoice = await selectInvoiceById(
              invoice.id,
              transaction
            )
            const oldInvoicePdfUrl = latestInvoice.pdfURL
            await updateInvoice(
              {
                ...latestInvoice,
                pdfURL: invoicePdfUrl,
              },
              transaction
            )
            return oldInvoicePdfUrl
          },
          { operationName: 'updateInvoicePdfUrl' }
        )
        /**
         * Delete the old invoice PDF from Cloudflare if it exists
         */
        if (oldInvoicePdfUrl) {
          try {
            await cloudflareMethods.deleteObject(
              cloudflareMethods.keyFromCDNUrl(oldInvoicePdfUrl)
            )
          } catch (error) {
            logger.info(
              `Error deleting old invoice PDF: ${oldInvoicePdfUrl}`,
              { error }
            )
          }
        }
        return {
          message: `PDF generated successfully: ${invoice.id}`,
          url: invoicePdfUrl,
        }
      },
      { 'trigger.invoice_id': invoiceId }
    )
  },
})

export const generateInvoicePdfIdempotently = async (
  invoiceId: string
) => {
  return tracedTrigger(
    'generateInvoicePdf',
    () =>
      generateInvoicePdfTask.trigger(
        { invoiceId },
        {
          idempotencyKey: invoiceId,
        }
      ),
    { 'trigger.invoice_id': invoiceId }
  )
}
