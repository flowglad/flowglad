export interface SubscriptionItem {
  id: string
  priceId: string
  productId: string
  productName: string
  quantity: number
  unitAmount: number
  currency: string
  interval?: 'month' | 'year' | 'week' | 'day'
  intervalCount?: number
  usageType?: 'metered' | 'licensed'
}

export function calculateTotalAmount(
  items: SubscriptionItem[]
): number {
  return items.reduce((total, item) => {
    const amount = item.unitAmount * item.quantity
    return total + amount
  }, 0)
}
