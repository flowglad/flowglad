import {
  subscriptionWithoutTrialDummyPurchase,
  subscriptionWithTrialDummyPurchase,
} from '@/stubs/purchaseStubs'
import { dummyProduct } from '@/stubs/productStubs'
import { dummyOrganization } from '@/stubs/organizationStubs'
import { subscriptionDummyPrice } from '@/stubs/priceStubs'
import {
  CheckoutFlowType,
  CheckoutSessionStatus,
  CheckoutSessionType,
} from '@/types'
import { CheckoutInfoCore } from '@/db/tableMethods/purchaseMethods'
import { CheckoutSession } from '@/db/schema/checkoutSessions'

const checkoutSession: CheckoutSession.Record = {
  id: '1',
  createdAt: new Date(),
  updatedAt: new Date(),
  outputName: null,
  outputMetadata: null,
  priceId: '1',
  organizationId: '1',
  customerName: 'Test Customer',
  customerEmail: 'test@test.com',
  stripeSetupIntentId: null,
  stripePaymentIntentId: null,
  status: CheckoutSessionStatus.Pending,
  expires: new Date(Date.now() + 1000 * 60 * 60 * 24),
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
  type: CheckoutSessionType.Product,
  targetSubscriptionId: null,
  createdByCommit: 'test',
  updatedByCommit: 'test',
  position: 0,
}

const checkoutInfoDefaults = {
  redirectUrl: '',
  clientSecret: '',
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
