import {
  AlertCircle,
  AlertTriangle,
  Check,
  Clock,
  RefreshCcw,
  X,
  XCircle,
} from 'lucide-react'
import { PaymentStatus } from '@/types'
import type { StatusConfigItem } from '../types'

export const paymentStatusConfig = {
  [PaymentStatus.Processing]: {
    label: 'Processing',
    variant: 'info',
    icon: Clock,
    tooltip: 'Payment is being processed by the payment provider.',
  },
  [PaymentStatus.Succeeded]: {
    label: 'Succeeded',
    variant: 'success',
    icon: Check,
    tooltip: 'Payment completed successfully.',
  },
  [PaymentStatus.Failed]: {
    label: 'Failed',
    variant: 'destructive',
    icon: XCircle,
    tooltip:
      'Payment failed. Customer may need to retry with a different payment method.',
  },
  [PaymentStatus.Canceled]: {
    label: 'Canceled',
    variant: 'muted',
    icon: X,
    tooltip: 'Payment was canceled before completion.',
  },
  [PaymentStatus.Refunded]: {
    label: 'Refunded',
    variant: 'muted',
    icon: RefreshCcw,
    tooltip: 'Payment was refunded to the customer.',
  },
  [PaymentStatus.RequiresConfirmation]: {
    label: 'Needs Confirmation',
    variant: 'warning',
    icon: AlertCircle,
    tooltip:
      'Payment requires additional confirmation before it can be processed.',
  },
  [PaymentStatus.RequiresAction]: {
    label: 'Action Required',
    variant: 'warning',
    icon: AlertTriangle,
    tooltip:
      'Customer action required (e.g., 3D Secure authentication).',
  },
} satisfies Record<PaymentStatus, StatusConfigItem>
