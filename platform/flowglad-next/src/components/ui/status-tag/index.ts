// PageHeaderNew adapter
export { statusConfigToPageHeaderBadge } from './adapters/pageHeader'
// Configs (for advanced usage or PageHeaderNew integration)
export {
  type ActiveStatus,
  activeStatusConfig,
  getPurchaseDisplayStatus,
  invoiceStatusConfig,
  type PurchaseDisplayStatus,
  paymentStatusConfig,
  purchaseDisplayStatusConfig,
  purchaseStatusConfig,
  subscriptionStatusConfig,
} from './configs'
// Core component and factory
export { createStatusTag } from './createStatusTag'
export { StatusTag, type StatusTagProps } from './StatusTag'
// Pre-built status tag components
export {
  ActiveStatusTag,
  booleanToActiveStatus,
  InvoiceStatusTag,
  PaymentStatusTag,
  PurchaseDisplayStatusTag,
  PurchaseStatusTag,
  SubscriptionStatusTag,
} from './tags'
export type {
  StatusConfig,
  StatusConfigItem,
  StatusIcon,
  StatusVariant,
} from './types'
