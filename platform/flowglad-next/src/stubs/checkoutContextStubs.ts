import {
  subscriptionWithoutTrialDummyPurchase,
  subscriptionWithTrialDummyPurchase,
} from '@/stubs/purchaseStubs'
import { dummyProduct } from '@/stubs/productStubs'
import { dummyOrganization } from '@/stubs/organizationStubs'
import { subscriptionDummyPrice } from '@/stubs/priceStubs'
import {
  CheckoutFlowType,
  CurrencyCode,
  IntervalUnit,
  PriceType,
  CheckoutSessionStatus,
  CheckoutSessionType,
} from '@/types'
import { CheckoutPageContextValues } from '@/contexts/checkoutPageContext'
import { CheckoutSession } from '@/db/schema/checkoutSessions'

const subscriptionDetails = {
  trialPeriodDays: 30,
  intervalUnit: IntervalUnit.Month,
  intervalCount: 1,
  pricePerBillingCycle: 100,
  currency: CurrencyCode.USD,
  type: PriceType.Subscription,
} as const

export const stubbedCheckoutSession: CheckoutSession.Record = {
  id: '1',
  createdAt: new Date(),
  updatedAt: new Date(),
  priceId: '1',
  invoiceId: null,
  outputName: null,
  outputMetadata: null,
  status: CheckoutSessionStatus.Pending,
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
  customerId: null,
  quantity: 1,
  successUrl: null,
  cancelUrl: null,
  type: CheckoutSessionType.Product,
  targetSubscriptionId: null,
}

const clearDiscountCode: CheckoutPageContextValues['clearDiscountCode'] =
  async () => false

const functionStubs = {
  editCheckoutSession: async () =>
    Promise.resolve({ checkoutSession: stubbedCheckoutSession }),
  attemptDiscountCode: async () => ({ isValid: true }),
  clearDiscountCode,
  feeCalculation: null,
}

export const subscriptionCheckoutPageContextValuesWithTrial: CheckoutPageContextValues =
  {
    currency: CurrencyCode.USD,
    product: dummyProduct,
    purchase: subscriptionWithTrialDummyPurchase,
    price: subscriptionDummyPrice,
    sellerOrganization: dummyOrganization,
    flowType: CheckoutFlowType.Subscription,
    redirectUrl: 'https://google.com',
    clientSecret: '123',
    checkoutSession: stubbedCheckoutSession,
    subscriptionDetails,
    ...functionStubs,
  }

export const subscriptionCheckoutPageContextValuesWithoutTrial: CheckoutPageContextValues =
  {
    currency: CurrencyCode.USD,
    product: dummyProduct,
    purchase: subscriptionWithoutTrialDummyPurchase,
    price: subscriptionDummyPrice,
    sellerOrganization: dummyOrganization,
    flowType: CheckoutFlowType.Subscription,
    redirectUrl: 'https://google.com',
    clientSecret: '123',
    checkoutSession: stubbedCheckoutSession,
    subscriptionDetails,
    ...functionStubs,
  }
