import { PriceType, SubscriptionStatus } from '@db-core/enums'

type MinimalSub = {
  status: SubscriptionStatus
  isFreePlan: boolean | null
}

export function shouldBlockCheckout({
  currentSubscriptions,
  priceType,
  allowMultipleSubscriptionsPerCustomer,
}: {
  currentSubscriptions: MinimalSub[]
  priceType: PriceType
  allowMultipleSubscriptionsPerCustomer: boolean | null
}): boolean {
  const hasActivePaid = (currentSubscriptions ?? []).some(
    (s) =>
      s.status === SubscriptionStatus.Active && s.isFreePlan === false
  )
  return (
    hasActivePaid &&
    priceType === PriceType.Subscription &&
    !(allowMultipleSubscriptionsPerCustomer ?? false)
  )
}
