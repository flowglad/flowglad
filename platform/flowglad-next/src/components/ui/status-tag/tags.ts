import {
  activeStatusConfig,
  invoiceStatusConfig,
  paymentStatusConfig,
  purchaseDisplayStatusConfig,
  purchaseStatusConfig,
  subscriptionStatusConfig,
} from './configs'
import { createStatusTag } from './createStatusTag'

/**
 * Pre-built status tag for subscription statuses.
 *
 * @example
 * <SubscriptionStatusTag status={subscription.status} />
 * <SubscriptionStatusTag status={subscription.status} showTooltip />
 */
export const SubscriptionStatusTag = createStatusTag(
  subscriptionStatusConfig
)

/**
 * Pre-built status tag for invoice statuses.
 *
 * @example
 * <InvoiceStatusTag status={invoice.status} />
 * <InvoiceStatusTag status={invoice.status} showTooltip />
 */
export const InvoiceStatusTag = createStatusTag(invoiceStatusConfig)

/**
 * Pre-built status tag for payment statuses.
 *
 * @example
 * <PaymentStatusTag status={payment.status} />
 * <PaymentStatusTag status={payment.status} showTooltip />
 */
export const PaymentStatusTag = createStatusTag(paymentStatusConfig)

/**
 * Pre-built status tag for purchase statuses (database values only).
 *
 * @example
 * <PurchaseStatusTag status={purchase.status} />
 * <PurchaseStatusTag status={purchase.status} showTooltip />
 */
export const PurchaseStatusTag = createStatusTag(purchaseStatusConfig)

/**
 * Pre-built status tag for purchase display statuses.
 * Includes the derived "Concluded" status for purchases with an endDate.
 * Use with `getPurchaseDisplayStatus()` helper for table displays.
 *
 * @example
 * import { PurchaseDisplayStatusTag, getPurchaseDisplayStatus } from '@/components/ui/status-tag'
 * <PurchaseDisplayStatusTag status={getPurchaseDisplayStatus(purchase)} />
 */
export const PurchaseDisplayStatusTag = createStatusTag(
  purchaseDisplayStatusConfig
)

/**
 * Pre-built status tag for boolean active/inactive statuses.
 * Use with `booleanToActiveStatus()` helper.
 *
 * @example
 * import { ActiveStatusTag, booleanToActiveStatus } from '@/components/ui/status-tag'
 * <ActiveStatusTag status={booleanToActiveStatus(product.active)} />
 */
export const ActiveStatusTag = createStatusTag(activeStatusConfig)

// Re-export helpers for convenience
export { booleanToActiveStatus } from './configs/active'
export { getPurchaseDisplayStatus } from './configs/purchase'
