'use client'
import type { Invoice } from '@db-core/schema/invoices'
import { Button } from '@/components/ui/button'

export const CustomerInvoiceDownloadReceiptButtonBanner = ({
  invoice,
}: {
  invoice: Invoice.Record
}) => {
  return (
    <div className="w-full flex items-center justify-between">
      {invoice.pdfURL && (
        <Button
          onClick={() => {
            window.open(invoice.pdfURL!, '_blank')
          }}
        >
          Download invoice
        </Button>
      )}

      {invoice.receiptPdfURL && (
        <Button
          onClick={() => {
            window.open(invoice.receiptPdfURL!, '_blank')
          }}
        >
          Download receipt
        </Button>
      )}
    </div>
  )
}
