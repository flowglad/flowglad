import {
  Check,
  Clock,
  FilePenLine,
  FileText,
  FileX,
  RefreshCcw,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { InvoiceStatus } from '@/types'
import type { StatusConfigItem } from '../types'

export const invoiceStatusConfig = {
  [InvoiceStatus.Draft]: {
    label: 'Draft',
    variant: 'muted',
    icon: FilePenLine,
    tooltip:
      'Editable invoice that has not been sent. Finalize to allow payment.',
  },
  [InvoiceStatus.Open]: {
    label: 'Open',
    variant: 'info',
    icon: FileText,
    tooltip: 'Finalized and sent. Waiting for customer payment.',
  },
  [InvoiceStatus.Paid]: {
    label: 'Paid',
    variant: 'success',
    icon: Check,
    tooltip: 'Fully paid. No balance remaining.',
  },
  [InvoiceStatus.Uncollectible]: {
    label: 'Uncollectible',
    variant: 'destructive',
    icon: XCircle,
    tooltip:
      'Marked as uncollectible after failed collection attempts. Closed without payment.',
  },
  [InvoiceStatus.Void]: {
    label: 'Void',
    variant: 'muted',
    icon: FileX,
    tooltip:
      'Canceled and removed from customer balance. Cannot be paid or modified.',
  },
  [InvoiceStatus.FullyRefunded]: {
    label: 'Refunded',
    variant: 'muted',
    icon: RefreshCcw,
    tooltip: 'Originally paid, then fully refunded to the customer.',
  },
  [InvoiceStatus.PartiallyRefunded]: {
    label: 'Partial Refund',
    variant: 'warning',
    icon: RefreshCw,
    tooltip:
      'Originally paid, then partially refunded. Remaining balance was retained.',
  },
  [InvoiceStatus.AwaitingPaymentConfirmation]: {
    label: 'Confirming',
    variant: 'info',
    icon: Clock,
    tooltip:
      'Payment submitted. Waiting for confirmation from payment provider.',
  },
} satisfies Record<InvoiceStatus, StatusConfigItem>
