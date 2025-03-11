import { ReceiptTemplate } from '@/pdf-generation/receipts'
import { CustomerFacingInvoicePage } from '../CustomerFacingInvoicePage'

const InvoiceReceiptPdfPreviewPage =
  CustomerFacingInvoicePage(ReceiptTemplate)

export default InvoiceReceiptPdfPreviewPage
