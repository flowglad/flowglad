export enum FlowgladActionKey {
  GetCustomerBilling = 'customers/billing',
  FindOrCreateCustomer = 'customers/find-or-create',
  CreateCheckoutSession = 'checkout-sessions/create',
  CancelSubscription = 'subscriptions/cancel',
  CreateSubscription = 'subscriptions/create',
  UpdateCustomer = 'customers/update',
}

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

export type SubscriptionExperimentalFields = {
  featureItems: FeatureItem[]
  usageMeterBalances: UsageMeterBalance[]
}
