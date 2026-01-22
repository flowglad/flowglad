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
    tooltip:
      'Checkout started but not completed. Waiting for customer to submit payment.',
  },
  [PurchaseStatus.Pending]: {
    label: 'Pending',
    variant: 'warning',
    icon: Clock,
    tooltip:
      'Payment submitted. Waiting for confirmation from payment provider.',
  },
  [PurchaseStatus.Paid]: {
    label: 'Paid',
    variant: 'success',
    icon: Check,
    tooltip:
      'Payment received. Product or subscription access granted.',
  },
  [PurchaseStatus.Failed]: {
    label: 'Failed',
    variant: 'destructive',
    icon: XCircle,
    tooltip:
      'Payment was declined or encountered an error. No charge was made.',
  },
  [PurchaseStatus.Refunded]: {
    label: 'Refunded',
    variant: 'muted',
    icon: RefreshCcw,
    tooltip:
      'Full refund issued. Customer has been credited the original amount.',
  },
  [PurchaseStatus.PartialRefund]: {
    label: 'Partial Refund',
    variant: 'warning',
    icon: RefreshCw,
    tooltip:
      'Partial refund issued. Customer received some but not all funds back.',
  },
  [PurchaseStatus.Fraudulent]: {
    label: 'Fraudulent',
    variant: 'destructive',
    icon: ShieldAlert,
    tooltip:
      'Flagged as potentially fraudulent. Review recommended before taking action.',
  },
} satisfies Record<PurchaseStatus, StatusConfigItem>
