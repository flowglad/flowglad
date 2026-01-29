import { fetchRequestHandler } from '@trpc/server/adapters/fetch'

import { customerBillingPortalRouter } from '@/server/routers/customerBillingPortalRouter'
import { createCustomerContext } from '@/server/trpcContext'
import { router } from '@/server/trpc'

/**
 * Customer-specific TRPC router.
 * Only includes customer billing portal procedures.
 * Uses createCustomerContext which validates customer sessions.
 */
const customerAppRouter = router({
  customerBillingPortal: customerBillingPortalRouter,
})

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc/customer',
    req,
    router: customerAppRouter,
    // @ts-expect-error - Context types differ slightly but are compatible
    createContext: createCustomerContext,
  })

export { handler as GET, handler as POST }
