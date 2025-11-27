import type { SubscriptionItem } from '../base/subscription-card/types'

export function calculateTotalAmount(
  items: SubscriptionItem[]
): number {
  return items.reduce((total, item) => {
    const amount = item.unitAmount * item.quantity
    return total + amount
  }, 0)
}
