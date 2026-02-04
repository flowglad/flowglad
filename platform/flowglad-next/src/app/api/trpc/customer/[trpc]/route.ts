/**
 * Customer TRPC route handler.
 * Handles customer billing portal procedures at /api/trpc/customer/*.
 * Uses createCustomerContext for customer session authentication.
 */
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { customerAppRouter } from '@/server/customerRouter'
import { createCustomerContext } from '@/server/trpcContext'

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc/customer',
    req,
    router: customerAppRouter,
    // @ts-expect-error - createCustomerContext signature matches but TS can't infer it
    createContext: createCustomerContext,
  })

export { handler as GET, handler as POST }
