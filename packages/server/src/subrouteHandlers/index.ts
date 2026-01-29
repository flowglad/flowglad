import {
  type AuthenticatedActionKey,
  FlowgladActionKey,
  type HybridActionKey,
} from '@flowglad/shared'
import {
  createActivateSubscriptionCheckoutSession,
  createAddPaymentMethodCheckoutSession,
  createCheckoutSession,
} from './checkoutSessionHandlers'
import {
  findOrCreateCustomer,
  getCustomerBilling,
  updateCustomer,
} from './customerHandlers'
import { getPricingModel } from './pricingModelHandlers'
import {
  claimResource,
  getResources,
  getResourceUsage,
  listResourceClaims,
  releaseResource,
} from './resourceHandlers'
import {
  adjustSubscription,
  cancelSubscription,
  getSubscriptions,
  uncancelSubscription,
} from './subscriptionHandlers'
import type { HybridSubRouteHandler, SubRouteHandler } from './types'
import { createUsageEvent } from './usageEventHandlers'
import { getUsageMeterBalances } from './usageMeterHandlers'

export const routeToHandlerMap: {
  [K in AuthenticatedActionKey]: SubRouteHandler<K>
} = {
  [FlowgladActionKey.GetCustomerBilling]: getCustomerBilling,
  [FlowgladActionKey.FindOrCreateCustomer]: findOrCreateCustomer,
  [FlowgladActionKey.UpdateCustomer]: updateCustomer,
  [FlowgladActionKey.CreateCheckoutSession]: createCheckoutSession,
  [FlowgladActionKey.CreateAddPaymentMethodCheckoutSession]:
    createAddPaymentMethodCheckoutSession,
  [FlowgladActionKey.CreateActivateSubscriptionCheckoutSession]:
    createActivateSubscriptionCheckoutSession,
  [FlowgladActionKey.CancelSubscription]: cancelSubscription,
  [FlowgladActionKey.UncancelSubscription]: uncancelSubscription,
  [FlowgladActionKey.AdjustSubscription]: adjustSubscription,
  [FlowgladActionKey.CreateSubscription]: async () => {
    return {
      data: {},
      status: 501,
      error: {
        code: 'Not Implemented',
        json: {},
      },
    }
  },
  [FlowgladActionKey.GetSubscriptions]: getSubscriptions,
  [FlowgladActionKey.CreateUsageEvent]: createUsageEvent,
  [FlowgladActionKey.GetResourceUsages]: getResources,
  [FlowgladActionKey.GetResourceUsage]: getResourceUsage,
  [FlowgladActionKey.ClaimResource]: claimResource,
  [FlowgladActionKey.ReleaseResource]: releaseResource,
  [FlowgladActionKey.ListResourceClaims]: listResourceClaims,
  [FlowgladActionKey.GetUsageMeterBalances]: getUsageMeterBalances,
  [FlowgladActionKey.GetFeatureAccess]: async () => {
    return {
      data: {},
      status: 501,
      error: {
        code: 'Not Implemented',
        json: {},
      },
    }
  },
}

export const hybridRouteToHandlerMap: {
  [K in HybridActionKey]: HybridSubRouteHandler<K>
} = {
  [FlowgladActionKey.GetPricingModel]: getPricingModel,
}

/**
 * Runtime check for whether an action key is a hybrid route.
 * Used by requestHandler to determine auth behavior.
 */
export const isHybridActionKey = (
  key: FlowgladActionKey
): key is HybridActionKey => {
  return key in hybridRouteToHandlerMap
}
