export type InvoiceStatus =
  | 'draft'
  | 'open'
  | 'paid'
  | 'void'
  | 'uncollectible'

export interface Invoice {
  id: string
  number?: string
  status: InvoiceStatus
  created: Date | string
  dueDate?: Date | string
  amountDue: number
  amountPaid?: number
  currency: string
  description?: string
  customerName?: string
  customerEmail?: string
  hostedInvoiceUrl?: string
  invoicePdf?: string
  lines?: InvoiceLine[]
}

export interface InvoiceLine {
  id: string
  description: string
  quantity: number
  unitAmount: number
  amount: number
}

export interface InvoicesListProps {
  invoices: Invoice[]
  onInvoiceClick?: (invoiceId: string) => void
  onDownload?: (invoiceId: string) => void
  loading?: boolean
  pagination?: {
    page: number
    pageSize: number
    total: number
    onPageChange: (page: number) => void
  }
  className?: string
}
