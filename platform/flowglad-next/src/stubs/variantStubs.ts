import { Variant } from '@/db/schema/variants'
import { CurrencyCode, IntervalUnit, PriceType } from '@/types'

export const subscriptionDummyVariant: Variant.SubscriptionRecord = {
  id: '1',
  name: 'Subscription',
  createdAt: new Date(),
  updatedAt: new Date(),
  intervalCount: 1,
  intervalUnit: IntervalUnit.Month,
  priceType: PriceType.Subscription,
  unitPrice: 100,
  trialPeriodDays: null,
  productId: '1',
  setupFeeAmount: null,
  isDefault: false,
  stripePriceId: null,
  active: true,
  livemode: false,
  currency: CurrencyCode.USD,
}
