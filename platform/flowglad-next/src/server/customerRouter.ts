import { logoutCustomer } from './mutations/logout'
import { customerBillingPortalRouter } from './routers/customerBillingPortalRouter'
import { router } from './trpc'

/**
 * Customer-only TRPC router.
 * This router uses createCustomerContext and is served via /api/trpc/customer.
 * Only includes customer billing portal procedures and customer-scoped utilities.
 */
export const customerAppRouter = router({
  customerBillingPortal: customerBillingPortalRouter,
  utils: router({
    logoutCustomer,
  }),
})

export type CustomerAppRouter = typeof customerAppRouter
