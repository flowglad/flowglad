import type { Flowglad as FlowgladNode } from '@flowglad/node'
import type { Price } from './pricingModel'

export enum FlowgladActionKey {
  GetCustomerBilling = 'customers/billing',
  FindOrCreateCustomer = 'customers/find-or-create',
  CreateCheckoutSession = 'checkout-sessions/create',
  CreateAddPaymentMethodCheckoutSession = 'checkout-sessions/create-add-payment-method',
  CreateActivateSubscriptionCheckoutSession = 'checkout-sessions/create-activate-subscription',
  CancelSubscription = 'subscriptions/cancel',
  UncancelSubscription = 'subscriptions/uncancel',
  AdjustSubscription = 'subscriptions/adjust',
  CreateSubscription = 'subscriptions/create',
  GetSubscriptions = 'subscriptions/list',
  UpdateCustomer = 'customers/update',
  CreateUsageEvent = 'usage-events/create',
  GetResourceUsages = 'resources/usages',
  GetResourceUsage = 'resources/usages/retrieve',
  ClaimResource = 'resources/claim',
  ReleaseResource = 'resources/release',
  ListResourceClaims = 'resources/claims',
  GetPricingModel = 'pricing-models/retrieve',
  GetUsageMeterBalances = 'usage-meters/balances',
  GetFeatureAccess = 'features/access',
  GetPaymentMethods = 'payment-methods/list',
}

/**
 * Action keys that require authentication.
 * These routes will return 401 if no valid session exists.
 */
export type AuthenticatedActionKey = Exclude<
  FlowgladActionKey,
  HybridActionKey
>

/**
 * Action keys that attempt authentication but gracefully fall back.
 * These routes return customer-specific data if authenticated,
 * or default data if not.
 */
export type HybridActionKey = typeof FlowgladActionKey.GetPricingModel

export enum HTTPMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
}

export interface FeatureItem {
  id: string
  livemode: boolean
  slug: string
  name: string
  type: 'toggle' | 'usage_credit_grant'
  amount: number
  usageMeterId: string
  renewalFrequency: 'once' | 'every_billing_period'
  expiredAt: string | null
  detachedAt: string | null
  detachedReason: string | null
}

export interface UsageMeterBalance {
  id: string
  livemode: boolean
  name: string
  slug: string
  availableBalance: number
  subscriptionId: string
}

export interface FeatureAccessItem {
  id: string
  livemode: boolean
  slug: string
  name: string
}

export type CustomerRetrieveBillingResponse =
  FlowgladNode.Customers.CustomerRetrieveBillingResponse

export type PaymentMethodDetails =
  CustomerRetrieveBillingResponse['paymentMethods'][number]

export type BillingWithChecks = CustomerRetrieveBillingResponse & {
  /**
   * @experimental
   * Checks if a feature is accessible for a given subscription, based on the feature's slug
   * @param featureSlug - The slug of the feature to check access for
   * @param refinementParams - Optional refinement parameters to further refine the check. If not provided, defaults check to first current subscription
   * @returns True if the feature is accessible, false otherwise
   */
  checkFeatureAccess: (
    featureSlug: string,
    refinementParams?: {
      subscriptionId?: string
    }
  ) => boolean
  /**
   * @experimental
   * Checks the available balance for a given usage meter, based on the usage meter's slug
   * @param usageMeterSlug - The slug of the usage meter to check the balance for
   * @param refinementParams - Optional refinement parameters to further refine the check. If not provided, defaults check to first current subscription
   * @returns The available balance for the usage meter, or null if the usage meter is not found
   */
  checkUsageBalance: (
    usageMeterSlug: string,
    refinementParams?: {
      subscriptionId?: string
    }
  ) => {
    availableBalance: number
  } | null

  /**
   * @experimental
   * Gets a product from the pricing model
   * @param productSlug - The slug of the product to get
   * @returns The product, or null if the product is not found
   */
  getProduct: (
    productSlug: string
  ) =>
    | CustomerRetrieveBillingResponse['pricingModel']['products'][number]
    | null

  /**
   * @experimental
   * Gets a price from the pricing model
   * @param priceSlug - The slug of the price to get
   * @returns The price, or null if the price is not found
   */
  getPrice: (priceSlug: string) => Price | null

  /**
   * @experimental
   * Checks if a customer has purchased a specific product, based on the product's slug
   * @param productSlug - The slug of the product to check
   * @returns True if the customer has purchased the product, false otherwise
   */
  hasPurchased: (productSlug: string) => boolean
}

export type SubscriptionExperimentalFields =
  | FlowgladNode.NonRenewingSubscriptionDetails.Experimental
  | FlowgladNode.StandardSubscriptionDetails.Experimental
