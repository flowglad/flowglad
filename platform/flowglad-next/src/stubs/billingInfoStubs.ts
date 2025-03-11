import {
  subscriptionWithoutTrialDummyPurchase,
  subscriptionWithTrialDummyPurchase,
} from '@/stubs/purchaseStubs'
import { dummyProduct } from '@/stubs/productStubs'
import { dummyOrganization } from '@/stubs/organizationStubs'
import { subscriptionDummyVariant } from '@/stubs/variantStubs'
import {
  CheckoutFlowType,
  PurchaseSessionStatus,
  PurchaseSessionType,
} from '@/types'
import { BillingInfoCore } from '@/db/tableMethods/purchaseMethods'
import { PurchaseSession } from '@/db/schema/purchaseSessions'

const purchaseSession: PurchaseSession.Record = {
  id: '1',
  createdAt: new Date(),
  updatedAt: new Date(),
  VariantId: '1',
  OrganizationId: '1',
  customerName: 'Test Customer',
  customerEmail: 'test@test.com',
  stripeSetupIntentId: null,
  stripePaymentIntentId: null,
  status: PurchaseSessionStatus.Pending,
  expires: new Date(Date.now() + 1000 * 60 * 60 * 24),
  PurchaseId: null,
  billingAddress: null,
  DiscountId: null,
  paymentMethodType: null,
  livemode: false,
  CustomerProfileId: null,
  successUrl: null,
  cancelUrl: null,
  quantity: 1,
  InvoiceId: null,
  type: PurchaseSessionType.Product,
}

const billingInfoDefaults = {
  redirectUrl: '',
  clientSecret: '',
  purchaseSession,
  totalDueAmount: 100,
  subtotalAmount: 100,
  discountAmount: 0,
  taxAmount: 0,
  feeCalculation: null,
}

export const subscriptionBillingInfoCoreWithTrial: BillingInfoCore = {
  product: dummyProduct,
  purchase: subscriptionWithTrialDummyPurchase,
  variant: subscriptionDummyVariant,
  sellerOrganization: dummyOrganization,
  flowType: CheckoutFlowType.Subscription,
  ...billingInfoDefaults,
}

export const subscriptionBillingInfoCoreWithoutTrial: BillingInfoCore =
  {
    product: dummyProduct,
    purchase: subscriptionWithoutTrialDummyPurchase,
    variant: subscriptionDummyVariant,
    sellerOrganization: dummyOrganization,
    flowType: CheckoutFlowType.Subscription,
    ...billingInfoDefaults,
  }
