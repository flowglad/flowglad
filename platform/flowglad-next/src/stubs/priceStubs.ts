import {
  nulledPriceColumns,
  Price,
  singlePaymentPriceDefaultColumns,
  usagePriceDefaultColumns,
} from '@/db/schema/prices'
import { CurrencyCode, IntervalUnit, PriceType } from '@/types'

export const subscriptionDummyPrice: Price.SubscriptionRecord = {
  id: '1',
  name: 'Subscription',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...nulledPriceColumns,
  intervalCount: 1,
  intervalUnit: IntervalUnit.Month,
  type: PriceType.Subscription,
  unitPrice: 100,
  productId: '1',
  isDefault: false,
  active: true,
  livemode: false,
  currency: CurrencyCode.USD,
  externalId: null,
  createdByCommit: 'test',
  updatedByCommit: 'test',
  position: 0,
}

export const singlePaymentDummyPrice: Price.SinglePaymentRecord = {
  ...subscriptionDummyPrice,
  startsWithCreditTrial: null,
  ...singlePaymentPriceDefaultColumns,
}

export const usageDummyPrice: Price.UsageRecord = {
  ...subscriptionDummyPrice,
  ...usagePriceDefaultColumns,
}
