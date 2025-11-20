'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Invoice } from '@/db/schema/invoices'
import CheckoutModal from '@/components/CheckoutModal'
import { CheckoutInfoCore } from '@/db/tableMethods/purchaseMethods'

export const CustomerInvoicePayButtonBanner = ({
  invoice,
  checkoutInfo,
}: {
  invoice: Invoice.Record
  checkoutInfo: CheckoutInfoCore
}) => {
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] =
    useState(false)
  return (
    <>
      <div className="space-y-4 w-full">
        <Button
          onClick={() => {
            setIsCheckoutModalOpen(true)
          }}
          className="w-full"
        >
          Pay Now
        </Button>
        {invoice.receiptPdfURL && (
          <Button
            onClick={() => {
              window.open(invoice.receiptPdfURL!, '_blank')
            }}
          >
            Pay via Manual Bank Transfer
          </Button>
        )}
      </div>
      <CheckoutModal
        isOpen={isCheckoutModalOpen}
        onClose={() => setIsCheckoutModalOpen(false)}
        checkoutInfo={checkoutInfo}
        title={`Pay Invoice #${invoice.invoiceNumber}`}
      />
    </>
  )
}

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

      {/* {invoice.receiptPdfURL && ( */}
      <Button
        onClick={() => {
          window.open(invoice.receiptPdfURL!, '_blank')
        }}
      >
        Download receipt
      </Button>
      {/* )} */}
    </div>
  )
}
