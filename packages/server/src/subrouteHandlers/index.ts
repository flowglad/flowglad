import { FlowgladActionKey } from '@flowglad/shared'
import {
  findOrCreateCustomer,
  getCustomerBilling,
} from './customerHandlers'
import { createCheckoutSession } from './checkoutSessionHandlers'
import { SubRouteHandler } from './types'
import { cancelSubscription } from './subscriptionHandlers'

export const routeToHandlerMap: Record<
  FlowgladActionKey,
  SubRouteHandler<FlowgladActionKey>
> = {
  [FlowgladActionKey.GetCustomerBilling]: getCustomerBilling,
  [FlowgladActionKey.FindOrCreateCustomer]: findOrCreateCustomer,
  [FlowgladActionKey.CreateCheckoutSession]: createCheckoutSession,
  [FlowgladActionKey.CancelSubscription]: cancelSubscription,
}
