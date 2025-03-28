// trpc.ts
export const runtime = 'nodejs' // Force Node.js runtime

import { TRPCError } from '@trpc/server'
import { TRPCApiContext, TRPCContext } from './trpcContext'
import { t } from './coreTrpcObject'
import { createTracingMiddleware } from './tracingMiddleware'
import { FeatureFlag } from '@/types'
import { hasFeatureFlag } from '@/utils/organizationHelpers'

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
        organization: (ctx as TRPCContext).organization,
        livemode,
      },
    })
  }
  const user = (ctx as TRPCContext).user
  if (!user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({
    ctx: {
      user,
      path: (ctx as TRPCContext).path,
      environment,
      organizationId: (ctx as TRPCContext).organizationId,
      organization: (ctx as TRPCContext).organization,
      livemode,
    },
  })
})

// Protected procedure with tracing
export const protectedProcedure = baseProcedure.use(isAuthed)

export const featureFlaggedProcedure = (featureFlag: FeatureFlag) => {
  return protectedProcedure.use(({ next, ctx }) => {
    const { organization } = ctx
    if (!hasFeatureFlag(organization, featureFlag)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Organization ${organization?.id} does not have feature flag ${featureFlag} enabled`,
      })
    }
    return next({ ctx })
  })
}

export const usageProcedure = featureFlaggedProcedure(
  FeatureFlag.Usage
)
