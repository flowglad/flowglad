import { FlowgladActionKey } from '@flowglad/shared'
import {
  findOrCreateCustomerProfile,
  getCustomerProfileBilling,
} from './customerProfileHandlers'
import { createCheckoutSession } from './checkoutSessionHandlers'
import { SubRouteHandler } from './types'

export const routeToHandlerMap: Record<
  FlowgladActionKey,
  SubRouteHandler<FlowgladActionKey>
> = {
  [FlowgladActionKey.GetCustomerProfileBilling]:
    getCustomerProfileBilling,
  [FlowgladActionKey.FindOrCreateCustomerProfile]:
    findOrCreateCustomerProfile,
  [FlowgladActionKey.CreateCheckoutSession]: createCheckoutSession,
}
