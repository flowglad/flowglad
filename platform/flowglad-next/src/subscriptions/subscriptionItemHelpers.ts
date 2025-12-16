import type { SubscriptionItem } from '@/db/schema/subscriptionItems'

/**
 * Determines if a subscription item is currently active based on its expiry date.
 * An item is active if it has no expiry date or if the expiry date is in the future.
 */
export const isSubscriptionItemActive = (
  item: Pick<SubscriptionItem.ClientUpsert, 'expiredAt'>
): boolean => {
  return !item.expiredAt || item.expiredAt > Date.now()
}

/**
 * Determines if a subscription item is a non-manuallyCreated.
 * non-manuallyCreated items are billable subscription items that come from a price/product.
 */
export const isNonManualSubscriptionItem = (
  item: Pick<
    SubscriptionItem.ClientUpsert,
    'manuallyCreated' | 'priceId'
  >
): boolean => {
  return (
    !item.manuallyCreated &&
    item.priceId !== null &&
    item.priceId !== undefined
  )
}

/**
 * Determines if a subscription item is an active and not manuallyCreated.
 */
export const isSubscriptionItemActiveAndNonManual = (
  item: Pick<
    SubscriptionItem.ClientUpsert,
    'manuallyCreated' | 'priceId' | 'expiredAt'
  >
): boolean => {
  return (
    isNonManualSubscriptionItem(item) &&
    isSubscriptionItemActive(item)
  )
}
