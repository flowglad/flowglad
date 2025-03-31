import { Price } from '@/db/schema/prices'
import { CurrencyCode, IntervalUnit, PriceType } from '@/types'

export const subscriptionDummyPrice: Price.SubscriptionRecord = {
  id: '1',
  name: 'Subscription',
  createdAt: new Date(),
  updatedAt: new Date(),
  intervalCount: 1,
  intervalUnit: IntervalUnit.Month,
  type: PriceType.Subscription,
  unitPrice: 100,
  trialPeriodDays: null,
  productId: '1',
  setupFeeAmount: null,
  isDefault: false,
  active: true,
  livemode: false,
  currency: CurrencyCode.USD,
  externalId: null,
}
