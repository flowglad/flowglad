import { FlowgladActionKey } from '@flowglad/shared'
import type { FlowgladServerAdmin } from '../FlowgladServerAdmin'
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
import {
  getDefaultPricingModel,
  type PublicRouteHandlerParams,
  type PublicRouteHandlerResult,
} from './pricingHandlers'
import {
  claimResource,
  getResources,
  listResourceClaims,
  releaseResource,
} from './resourceHandlers'
import {
  adjustSubscription,
  cancelSubscription,
  uncancelSubscription,
} from './subscriptionHandlers'
import type { SubRouteHandler } from './types'
import { createUsageEvent } from './usageEventHandlers'

/**
 * Type for public route handlers that use FlowgladServerAdmin instead of FlowgladServer.
 */
export type PublicRouteHandler = (
  params: PublicRouteHandlerParams,
  admin: FlowgladServerAdmin
) => Promise<PublicRouteHandlerResult>

/**
 * Map of public routes to their handlers.
 * These routes bypass authentication and use FlowgladServerAdmin directly.
 */
export const publicRouteToHandlerMap: Partial<
  Record<FlowgladActionKey, PublicRouteHandler>
> = {
  [FlowgladActionKey.GetDefaultPricingModel]: getDefaultPricingModel,
}

export const routeToHandlerMap: {
  [K in Exclude<
    FlowgladActionKey,
    FlowgladActionKey.GetDefaultPricingModel
  >]: SubRouteHandler<K>
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
  [FlowgladActionKey.CreateUsageEvent]: createUsageEvent,
  [FlowgladActionKey.GetResources]: getResources,
  [FlowgladActionKey.ClaimResource]: claimResource,
  [FlowgladActionKey.ReleaseResource]: releaseResource,
  [FlowgladActionKey.ListResourceClaims]: listResourceClaims,
}
