import {
  CalendarCheck,
  Check,
  Clock,
  FileText,
  RefreshCcw,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import type { Purchase } from '@/db/schema/purchases'
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
    variant: 'info',
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

/**
 * Display status for purchases that includes both database statuses
 * and the derived "Concluded" status (for purchases with an endDate).
 */
export type PurchaseDisplayStatus = PurchaseStatus | 'concluded'

/**
 * Extended config that includes the "Concluded" display status.
 * Use this with PurchaseDisplayStatusTag for table displays.
 */
export const purchaseDisplayStatusConfig = {
  ...purchaseStatusConfig,
  concluded: {
    label: 'Concluded',
    variant: 'muted',
    icon: CalendarCheck,
    tooltip:
      'Purchase period has ended. The subscription or access term is complete.',
  },
} satisfies Record<PurchaseDisplayStatus, StatusConfigItem>

/**
 * Computes the display status for a purchase based on its lifecycle state.
 * - Returns 'concluded' if the purchase has an endDate
 * - Otherwise returns the actual database status
 *
 * Use this with PurchaseDisplayStatusTag for consistent display in tables.
 */
export const getPurchaseDisplayStatus = (
  purchase: Purchase.ClientRecord
): PurchaseDisplayStatus => {
  if (purchase.endDate) {
    return 'concluded'
  }
  return purchase.status
}
