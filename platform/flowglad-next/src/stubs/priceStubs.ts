import {
  nulledPriceColumns,
  type Price,
  singlePaymentPriceDefaultColumns,
  usagePriceDefaultColumns,
} from '@/db/schema/prices'
import { CurrencyCode, IntervalUnit, PriceType } from '@/types'

export const subscriptionDummyPrice: Price.SubscriptionRecord = {
  id: '1',
  name: 'Subscription',
  createdAt: Date.now(),
  updatedAt: Date.now(),
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
  pricingModelId: 'test',
  slug: '',
}

export const singlePaymentDummyPrice: Price.SinglePaymentRecord = {
  ...subscriptionDummyPrice,
  ...singlePaymentPriceDefaultColumns,
  intervalCount: null,
  intervalUnit: null,
  trialPeriodDays: null,
  usageEventsPerUnit: null,
  usageMeterId: null,
}

export const usageDummyPrice: Price.UsageRecord = {
  ...subscriptionDummyPrice,
  ...usagePriceDefaultColumns,
}
