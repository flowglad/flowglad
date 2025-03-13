export const runtime = 'nodejs' // Force Node.js runtime

import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { TRPCApiContext, TRPCContext } from './trpcContext'
import { OpenApiMeta } from 'trpc-swagger'

const t = initTRPC.meta<OpenApiMeta>().create({
  transformer: superjson,
})

export const router = t.router
export const publicProcedure = t.procedure

const isAuthed = t.middleware(({ next, ctx }) => {
  const { isApi, environment, apiKey } = ctx as TRPCApiContext
  const livemode = environment === 'live'
  if (isApi) {
    return next({
      ctx: {
        auth: { userId: 'api' },
        path: (ctx as TRPCContext).path,
        environment,
        apiKey,
        organizationId: (ctx as TRPCContext).organizationId,
        livemode,
      },
    })
  }
  const auth = (ctx as TRPCContext).auth
  if (!auth.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({
    ctx: {
      auth,
      path: (ctx as TRPCContext).path,
      environment,
      organizationId: (ctx as TRPCContext).organizationId,
      livemode,
    },
  })
})

export const protectedProcedure = t.procedure.use(isAuthed)
