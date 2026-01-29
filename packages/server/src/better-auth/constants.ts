import {
  type AuthenticatedActionKey,
  FlowgladActionKey,
  type HybridActionKey,
} from '@flowglad/shared'

/**
 * Mapping from camelCase endpoint keys to FlowgladActionKey values.
 * Used for exhaustiveness testing to ensure all action keys have endpoints.
 */
export const endpointKeyToActionKey: Record<
  string,
  FlowgladActionKey
> = {
  getCustomerBilling: FlowgladActionKey.GetCustomerBilling,
  findOrCreateCustomer: FlowgladActionKey.FindOrCreateCustomer,
  createCheckoutSession: FlowgladActionKey.CreateCheckoutSession,
  createAddPaymentMethodCheckoutSession:
    FlowgladActionKey.CreateAddPaymentMethodCheckoutSession,
  createActivateSubscriptionCheckoutSession:
    FlowgladActionKey.CreateActivateSubscriptionCheckoutSession,
  cancelSubscription: FlowgladActionKey.CancelSubscription,
  uncancelSubscription: FlowgladActionKey.UncancelSubscription,
  adjustSubscription: FlowgladActionKey.AdjustSubscription,
  createSubscription: FlowgladActionKey.CreateSubscription,
  getSubscriptions: FlowgladActionKey.GetSubscriptions,
  updateCustomer: FlowgladActionKey.UpdateCustomer,
  createUsageEvent: FlowgladActionKey.CreateUsageEvent,
  getResources: FlowgladActionKey.GetResourceUsages,
  getResourceUsage: FlowgladActionKey.GetResourceUsage,
  claimResource: FlowgladActionKey.ClaimResource,
  releaseResource: FlowgladActionKey.ReleaseResource,
  listResourceClaims: FlowgladActionKey.ListResourceClaims,
  getUsageMeterBalances: FlowgladActionKey.GetUsageMeterBalances,
}

/**
 * Compile-time exhaustiveness check for endpointKeyToActionKey.
 *
 * This object uses `satisfies` to cause a TypeScript compile error if any
 * FlowgladActionKey value is missing. Unlike `as`, `satisfies` validates
 * without bypassing type checking.
 *
 * When a new FlowgladActionKey is added:
 * 1. TypeScript will error here until you add the mapping
 * 2. The mapping must point to a key that exists in endpointKeyToActionKey
 */
const _actionKeyToEndpointKey = {
  [FlowgladActionKey.GetCustomerBilling]: 'getCustomerBilling',
  [FlowgladActionKey.FindOrCreateCustomer]: 'findOrCreateCustomer',
  [FlowgladActionKey.CreateCheckoutSession]: 'createCheckoutSession',
  [FlowgladActionKey.CreateAddPaymentMethodCheckoutSession]:
    'createAddPaymentMethodCheckoutSession',
  [FlowgladActionKey.CreateActivateSubscriptionCheckoutSession]:
    'createActivateSubscriptionCheckoutSession',
  [FlowgladActionKey.CancelSubscription]: 'cancelSubscription',
  [FlowgladActionKey.UncancelSubscription]: 'uncancelSubscription',
  [FlowgladActionKey.AdjustSubscription]: 'adjustSubscription',
  [FlowgladActionKey.CreateSubscription]: 'createSubscription',
  [FlowgladActionKey.GetSubscriptions]: 'getSubscriptions',
  [FlowgladActionKey.UpdateCustomer]: 'updateCustomer',
  [FlowgladActionKey.CreateUsageEvent]: 'createUsageEvent',
  [FlowgladActionKey.GetResourceUsages]: 'getResources',
  [FlowgladActionKey.GetResourceUsage]: 'getResourceUsage',
  [FlowgladActionKey.ClaimResource]: 'claimResource',
  [FlowgladActionKey.ReleaseResource]: 'releaseResource',
  [FlowgladActionKey.ListResourceClaims]: 'listResourceClaims',
  [FlowgladActionKey.GetUsageMeterBalances]: 'getUsageMeterBalances',
} satisfies Record<
  AuthenticatedActionKey,
  keyof typeof endpointKeyToActionKey
>

/**
 * Compile-time exhaustiveness check for hybrid routes.
 * These routes attempt auth but gracefully fall back to unauthenticated behavior.
 */
const _hybridActionKeyToEndpointKey = {
  [FlowgladActionKey.GetPricingModel]: 'getPricingModel',
} satisfies Record<HybridActionKey, string>
