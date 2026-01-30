import { PaymentStatus } from '@db-core/enums'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Clock,
  RefreshCcw,
  X,
  XCircle,
} from 'lucide-react'
import type { StatusConfigItem } from '../types'

export const paymentStatusConfig = {
  [PaymentStatus.Processing]: {
    label: 'Processing',
    variant: 'info',
    icon: Clock,
    tooltip:
      'Submitted to payment provider. Typically confirms within seconds.',
  },
  [PaymentStatus.Succeeded]: {
    label: 'Succeeded',
    variant: 'success',
    icon: Check,
    tooltip:
      'Successfully charged. Funds will be deposited to your account.',
  },
  [PaymentStatus.Failed]: {
    label: 'Failed',
    variant: 'destructive',
    icon: XCircle,
    tooltip:
      'Charge was declined. Customer may need to update their payment method.',
  },
  [PaymentStatus.Canceled]: {
    label: 'Canceled',
    variant: 'muted',
    icon: X,
    tooltip: 'Canceled before completion. No charge was made.',
  },
  [PaymentStatus.Refunded]: {
    label: 'Refunded',
    variant: 'muted',
    icon: RefreshCcw,
    tooltip:
      'Funds returned to customer. May take 5–10 days to appear on their statement.',
  },
  [PaymentStatus.RequiresConfirmation]: {
    label: 'Needs Confirmation',
    variant: 'warning',
    icon: AlertCircle,
    tooltip:
      'Waiting for additional confirmation (e.g., bank approval).',
  },
  [PaymentStatus.RequiresAction]: {
    label: 'Action Required',
    variant: 'warning',
    icon: AlertTriangle,
    tooltip:
      'Customer must complete authentication (e.g., 3D Secure) to proceed.',
  },
} satisfies Record<PaymentStatus, StatusConfigItem>
