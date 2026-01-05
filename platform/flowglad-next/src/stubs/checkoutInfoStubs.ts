import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { CheckoutInfoCore } from '@/db/tableMethods/purchaseMethods'
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
} from '@/types'

const checkoutSession: CheckoutSession.Record = {
  id: '1',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  outputName: null,
  outputMetadata: null,
  priceId: '1',
  organizationId: '1',
  pricingModelId: 'pm_test',
  customerName: 'Test Customer',
  customerEmail: 'test@test.com',
  stripeSetupIntentId: null,
  stripePaymentIntentId: null,
  status: CheckoutSessionStatus.Pending,
  expires: Date.now() + 1000 * 60 * 60 * 24,
  purchaseId: null,
  billingAddress: null,
  discountId: null,
  paymentMethodType: null,
  livemode: false,
  customerId: null,
  successUrl: null,
  cancelUrl: null,
  quantity: 1,
  invoiceId: null,
  automaticallyUpdateSubscriptions: null,
  type: CheckoutSessionType.Product,
  targetSubscriptionId: null,
  createdByCommit: 'test',
  updatedByCommit: 'test',
  position: 0,
  preserveBillingCycleAnchor: false,
}

const checkoutInfoDefaults = {
  redirectUrl: '',
  clientSecret: '',
  customerSessionClientSecret: null,
  checkoutSession,
  totalDueAmount: 100,
  subtotalAmount: 100,
  discountAmount: 0,
  taxAmount: 0,
  feeCalculation: null,
}

export const subscriptionCheckoutInfoCoreWithTrial: CheckoutInfoCore =
  {
    product: dummyProduct,
    purchase: subscriptionWithTrialDummyPurchase,
    price: subscriptionDummyPrice,
    sellerOrganization: dummyOrganization,
    flowType: CheckoutFlowType.Subscription,
    ...checkoutInfoDefaults,
  }

export const subscriptionCheckoutInfoCoreWithoutTrial: CheckoutInfoCore =
  {
    product: dummyProduct,
    purchase: subscriptionWithoutTrialDummyPurchase,
    price: subscriptionDummyPrice,
    sellerOrganization: dummyOrganization,
    flowType: CheckoutFlowType.Subscription,
    ...checkoutInfoDefaults,
  }
