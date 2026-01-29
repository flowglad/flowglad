import {
  IntervalUnit,
  PriceType,
  PurchaseStatus,
} from '@db-core/enums'
import type { Purchase } from '@db-core/schema/purchases'

export const subscriptionWithoutTrialDummyPurchase: Purchase.SubscriptionPurchaseRecord =
  {
    id: '1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    name: 'Test Purchase',
    intervalCount: 1,
    customerId: '1',
    organizationId: '1',
    priceId: '1',
    intervalUnit: IntervalUnit.Month,
    trialPeriodDays: 0,
    quantity: 1,
    billingCycleAnchor: Date.now(),
    pricePerBillingCycle: 100,
    firstInvoiceValue: 100,
    totalPurchaseValue: null,
    purchaseDate: Date.now(),
    priceType: PriceType.Subscription,
    endDate: null,
    bankPaymentOnly: false,
    archived: false,
    proposal: null,
    status: PurchaseStatus.Pending,
    billingAddress: null,
    livemode: false,
    metadata: null,
    pricingModelId: '1',
    createdByCommit: 'test',
    updatedByCommit: 'test',
    position: 0,
  }

export const subscriptionWithTrialDummyPurchase: Purchase.SubscriptionPurchaseRecord =
  {
    ...subscriptionWithoutTrialDummyPurchase,
    trialPeriodDays: 10,
  }
