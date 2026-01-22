import {
  Check,
  Clock,
  FileText,
  RefreshCcw,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { PurchaseStatus } from '@/types'
import type { StatusConfigItem } from '../types'

export const purchaseStatusConfig = {
  [PurchaseStatus.Open]: {
    label: 'Open',
    variant: 'info',
    icon: FileText,
    tooltip: 'Purchase is open and awaiting payment.',
  },
  [PurchaseStatus.Pending]: {
    label: 'Pending',
    variant: 'warning',
    icon: Clock,
    tooltip: 'Purchase is being processed.',
  },
  [PurchaseStatus.Paid]: {
    label: 'Paid',
    variant: 'success',
    icon: Check,
    tooltip: 'Purchase has been paid successfully.',
  },
  [PurchaseStatus.Failed]: {
    label: 'Failed',
    variant: 'destructive',
    icon: XCircle,
    tooltip: 'Purchase payment failed.',
  },
  [PurchaseStatus.Refunded]: {
    label: 'Refunded',
    variant: 'muted',
    icon: RefreshCcw,
    tooltip: 'Purchase was fully refunded.',
  },
  [PurchaseStatus.PartialRefund]: {
    label: 'Partial Refund',
    variant: 'warning',
    icon: RefreshCw,
    tooltip: 'Purchase was partially refunded.',
  },
  [PurchaseStatus.Fraudulent]: {
    label: 'Fraudulent',
    variant: 'destructive',
    icon: ShieldAlert,
    tooltip: 'Purchase was flagged as fraudulent.',
  },
} satisfies Record<PurchaseStatus, StatusConfigItem>
