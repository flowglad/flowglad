import {
  subscriptionWithoutTrialDummyPurchase,
  subscriptionWithTrialDummyPurchase,
} from '@/stubs/purchaseStubs'
import { dummyProduct } from '@/stubs/productStubs'
import { dummyOrganization } from '@/stubs/organizationStubs'
import { subscriptionDummyVariant } from '@/stubs/variantStubs'
import {
  CheckoutFlowType,
  CurrencyCode,
  IntervalUnit,
  PriceType,
  PurchaseSessionStatus,
  PurchaseSessionType,
} from '@/types'
import { CheckoutPageContextValues } from '@/contexts/checkoutPageContext'
import { PurchaseSession } from '@/db/schema/purchaseSessions'

const subscriptionDetails = {
  trialPeriodDays: 30,
  intervalUnit: IntervalUnit.Month,
  intervalCount: 1,
  pricePerBillingCycle: 100,
  currency: CurrencyCode.USD,
}

export const stubbedPurchaseSession: PurchaseSession.Record = {
  id: '1',
  createdAt: new Date(),
  updatedAt: new Date(),
  variantId: '1',
  invoiceId: null,
  status: PurchaseSessionStatus.Pending,
  organizationId: '1',
  customerName: 'Test Customer',
  customerEmail: 'test@test.com',
  stripeSetupIntentId: null,
  stripePaymentIntentId: null,
  expires: new Date(Date.now() + 1000 * 60 * 60 * 24),
  billingAddress: null,
  purchaseId: null,
  discountId: null,
  paymentMethodType: null,
  livemode: false,
  customerProfileId: null,
  quantity: 1,
  successUrl: null,
  cancelUrl: null,
  type: PurchaseSessionType.Product,
}

const clearDiscountCode: CheckoutPageContextValues['clearDiscountCode'] =
  async () => false

const functionStubs = {
  editPurchaseSession: async () =>
    Promise.resolve({ purchaseSession: stubbedPurchaseSession }),
  attemptDiscountCode: async () => ({ isValid: true }),
  clearDiscountCode,
  feeCalculation: null,
}

export const subscriptionCheckoutPageContextValuesWithTrial: CheckoutPageContextValues =
  {
    currency: CurrencyCode.USD,
    product: dummyProduct,
    purchase: subscriptionWithTrialDummyPurchase,
    variant: subscriptionDummyVariant,
    sellerOrganization: dummyOrganization,
    flowType: CheckoutFlowType.Subscription,
    redirectUrl: 'https://google.com',
    clientSecret: '123',
    purchaseSession: stubbedPurchaseSession,
    subscriptionDetails,
    ...functionStubs,
  }

export const subscriptionCheckoutPageContextValuesWithoutTrial: CheckoutPageContextValues =
  {
    currency: CurrencyCode.USD,
    product: dummyProduct,
    purchase: subscriptionWithoutTrialDummyPurchase,
    variant: subscriptionDummyVariant,
    sellerOrganization: dummyOrganization,
    flowType: CheckoutFlowType.Subscription,
    redirectUrl: 'https://google.com',
    clientSecret: '123',
    purchaseSession: stubbedPurchaseSession,
    subscriptionDetails,
    ...functionStubs,
  }
