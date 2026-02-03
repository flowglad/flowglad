/**
 * Customer-only TRPC router.
 * This router is served at /api/trpc/customer and uses createCustomerContext.
 * It contains only procedures that should use customer authentication.
 */
import { customerBillingPortalRouter } from './routers/customerBillingPortalRouter'
import { router } from './trpc'

/**
 * Customer app router.
 * Contains only the customerBillingPortal routes that require customer authentication.
 */
export const customerAppRouter = router({
  customerBillingPortal: customerBillingPortalRouter,
})

export type CustomerAppRouter = typeof customerAppRouter
