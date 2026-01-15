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

export const routeToHandlerMap: {
  [K in FlowgladActionKey]: SubRouteHandler<K>
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
