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
  cancelSubscription,
  uncancelSubscription,
} from './subscriptionHandlers'
import type { SubRouteHandler } from './types'

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
}
