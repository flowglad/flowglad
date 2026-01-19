import { Result } from 'better-result'
import type { CheckoutPageContextValues } from '@/contexts/checkoutPageContext'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import { dummyOrganization } from '@/stubs/organizationStubs'
import { subscriptionDummyPrice } from '@/stubs/priceStubs'
import { dummyProduct } from '@/stubs/productStubs'
import {
  subscriptionWithoutTrialDummyPurchase,
  subscriptionWithTrialDummyPurchase,
} from '@/stubs/purchaseStubs'
import {
  CheckoutFlowType,
  CheckoutSessionStatus,
  CheckoutSessionType,
  CurrencyCode,
  IntervalUnit,
  PriceType,
} from '@/types'

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
  createdAt: Date.now(),
  updatedAt: Date.now(),
  priceId: '1',
  invoiceId: null,
  outputName: null,
  outputMetadata: null,
  status: CheckoutSessionStatus.Pending,
  organizationId: '1',
  pricingModelId: 'pm_test',
  customerName: 'Test Customer',
  customerEmail: 'test@test.com',
  stripeSetupIntentId: null,
  stripePaymentIntentId: null,
  expires: Date.now() + 1000 * 60 * 60 * 24,
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
  createdByCommit: 'test',
  updatedByCommit: 'test',
  position: 0,
  automaticallyUpdateSubscriptions: null,
  preserveBillingCycleAnchor: false,
}

const clearDiscountCode: CheckoutPageContextValues['clearDiscountCode'] =
  async () => Result.ok(false)

const functionStubs = {
  editCheckoutSession: async () =>
    Promise.resolve({ checkoutSession: stubbedCheckoutSession }),
  attemptDiscountCode: async () => ({ isValid: true }),
  clearDiscountCode,
  feeCalculation: null,
  editCheckoutSessionPaymentMethodType: async () =>
    Promise.resolve({ checkoutSession: stubbedCheckoutSession }),
  editCheckoutSessionCustomerEmail: async () =>
    Promise.resolve({ checkoutSession: stubbedCheckoutSession }),
  editCheckoutSessionBillingAddress: async () =>
    Promise.resolve({
      checkoutSession: stubbedCheckoutSession,
      feeCalculation: null,
    }),
  editCheckoutSessionAutomaticallyUpdateSubscriptions: async () =>
    Promise.resolve({ checkoutSession: stubbedCheckoutSession }),
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
    customerSessionClientSecret: null,
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
    customerSessionClientSecret: null,
    checkoutSession: stubbedCheckoutSession,
    subscriptionDetails,
    ...functionStubs,
  }
