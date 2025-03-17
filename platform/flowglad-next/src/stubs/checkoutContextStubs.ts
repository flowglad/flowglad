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
}

export const stubbedCheckoutSession: CheckoutSession.Record = {
  id: '1',
  createdAt: new Date(),
  updatedAt: new Date(),
  variantId: '1',
  invoiceId: null,
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
  customerProfileId: null,
  quantity: 1,
  successUrl: null,
  cancelUrl: null,
  type: CheckoutSessionType.Product,
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
    variant: subscriptionDummyVariant,
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
    variant: subscriptionDummyVariant,
    sellerOrganization: dummyOrganization,
    flowType: CheckoutFlowType.Subscription,
    redirectUrl: 'https://google.com',
    clientSecret: '123',
    checkoutSession: stubbedCheckoutSession,
    subscriptionDetails,
    ...functionStubs,
  }
