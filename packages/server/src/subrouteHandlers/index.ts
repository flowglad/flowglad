import { FlowgladActionKey } from '@flowglad/shared'
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
import { getDefaultPricingModel } from './pricingHandlers'
import {
  adjustSubscription,
  cancelSubscription,
  uncancelSubscription,
} from './subscriptionHandlers'
import type { SubRouteHandler } from './types'
import { createUsageEvent } from './usageEventHandlers'

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
}

/**
 * Map of public routes to their handlers.
 * These routes don't require authentication and use FlowgladServerAdmin.
 */
export const publicRouteToHandlerMap = {
  [FlowgladActionKey.GetDefaultPricingModel]: getDefaultPricingModel,
}
