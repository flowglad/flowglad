import { Purchase } from '@/db/schema/purchases'
import { IntervalUnit, PriceType, PurchaseStatus } from '@/types'

export const subscriptionWithoutTrialDummyPurchase: Purchase.SubscriptionPurchaseRecord =
  {
    id: '1',
    createdAt: new Date(),
    updatedAt: new Date(),
    name: 'Test Purchase',
    intervalCount: 1,
    customerProfileId: '1',
    organizationId: '1',
    variantId: '1',
    intervalUnit: IntervalUnit.Month,
    trialPeriodDays: 0,
    stripesubscriptionId: 'sub_123456',
    quantity: 1,
    billingCycleAnchor: new Date(),
    pricePerBillingCycle: 100,
    firstInvoiceValue: 100,
    totalPurchaseValue: null,
    purchaseDate: new Date(),
    priceType: PriceType.Subscription,
    endDate: null,
    bankPaymentOnly: false,
    archived: false,
    proposal: null,
    status: PurchaseStatus.Pending,
    billingAddress: null,
    livemode: false,
  }

export const subscriptionWithTrialDummyPurchase: Purchase.SubscriptionPurchaseRecord =
  {
    ...subscriptionWithoutTrialDummyPurchase,
    trialPeriodDays: 10,
  }
