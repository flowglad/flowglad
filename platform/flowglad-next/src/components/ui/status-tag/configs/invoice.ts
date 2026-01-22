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
      'Invoice has not been finalized. It can still be edited.',
  },
  [InvoiceStatus.Open]: {
    label: 'Open',
    variant: 'info',
    icon: FileText,
    tooltip:
      'Invoice is finalized and awaiting payment from the customer.',
  },
  [InvoiceStatus.Paid]: {
    label: 'Paid',
    variant: 'success',
    icon: Check,
    tooltip: 'Invoice has been paid in full.',
  },
  [InvoiceStatus.Uncollectible]: {
    label: 'Uncollectible',
    variant: 'destructive',
    icon: XCircle,
    tooltip:
      'Invoice has been marked as uncollectible. Payment is not expected.',
  },
  [InvoiceStatus.Void]: {
    label: 'Void',
    variant: 'muted',
    icon: FileX,
    tooltip: 'Invoice has been voided and is no longer valid.',
  },
  [InvoiceStatus.FullyRefunded]: {
    label: 'Refunded',
    variant: 'muted',
    icon: RefreshCcw,
    tooltip: 'Payment was fully refunded to the customer.',
  },
  [InvoiceStatus.PartiallyRefunded]: {
    label: 'Partial Refund',
    variant: 'warning',
    icon: RefreshCw,
    tooltip:
      'Payment was partially refunded. Some amount is still retained.',
  },
  [InvoiceStatus.AwaitingPaymentConfirmation]: {
    label: 'Confirming',
    variant: 'info',
    icon: Clock,
    tooltip:
      'Payment is being processed. Awaiting confirmation from payment provider.',
  },
} satisfies Record<InvoiceStatus, StatusConfigItem>
