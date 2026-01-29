import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { customerAppRouter } from '@/server/customerRouter'
import { createCustomerContext } from '@/server/trpcContext'

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc/customer',
    req,
    router: customerAppRouter,
    // @ts-expect-error - TRPC types don't perfectly align with customer context
    createContext: createCustomerContext,
  })

export { handler as GET, handler as POST }
