// trpc.ts
export const runtime = 'nodejs' // Force Node.js runtime

import { TRPCError } from '@trpc/server'
import { TRPCApiContext, TRPCContext } from './trpcContext'
import { t } from './coreTrpcObject'
import { createTracingMiddleware } from './tracingMiddleware'

// Create tracing middleware factory
const tracingMiddlewareFactory = createTracingMiddleware()

// Create tracing middleware for this tRPC instance
const tracingMiddleware = tracingMiddlewareFactory(t)

export const router = t.router

// Apply tracing middleware to base procedure
const baseProcedure = t.procedure.use(tracingMiddleware)

// Public procedure with tracing
export const publicProcedure = baseProcedure

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

// Protected procedure with tracing
export const protectedProcedure = baseProcedure.use(isAuthed)
