import { fetchRequestHandler } from '@trpc/server/adapters/fetch'

import { appRouter } from '@/server'
import { createContext } from '@/server/trpcContext'

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    // @ts-expect-error
    createContext,
  })

export { handler as GET, handler as POST }
