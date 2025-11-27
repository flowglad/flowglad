// trpc.ts
export const runtime = 'nodejs' // Force Node.js runtime

import { TRPCError } from '@trpc/server'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectCustomerAndOrganizationByCustomerWhere,
  selectCustomers,
} from '@/db/tableMethods/customerMethods'
import type { FeatureFlag } from '@/types'
import { IS_DEV } from '@/utils/core'
import { getCustomerBillingPortalOrganizationId } from '@/utils/customerBillingPortalState'
import { hasFeatureFlag } from '@/utils/organizationHelpers'
import { t } from './coreTrpcObject'
import { createTracingMiddleware } from './tracingMiddleware'
import type { TRPCApiContext, TRPCContext } from './trpcContext'

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

const isCustomerAuthed = t.middleware(async ({ next, ctx }) => {
  const { environment } = ctx as TRPCApiContext
  const livemode = environment === 'live'
  const user = (ctx as TRPCContext).user
  if (!user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  const organizationId =
    await getCustomerBillingPortalOrganizationId()

  const [customerAndOrganization] = await adminTransaction(
    async ({ transaction }) => {
      return selectCustomerAndOrganizationByCustomerWhere(
        {
          userId: user.id,
          organizationId,
        },
        transaction
      )
    }
  )

  if (!customerAndOrganization) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }

  return next({
    ctx: {
      user,
      customer: customerAndOrganization.customer,
      organization: customerAndOrganization.organization,
      path: (ctx as TRPCContext).path,
      environment,
      organizationId,
      livemode,
    },
  })
})

const isCustomerBillingAuthed = t.middleware(
  async ({ next, ctx }) => {
    const { isApi, environment } = ctx as TRPCApiContext
    const livemode = environment === 'live'
    const user = (ctx as TRPCContext).user
    if (!user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    const [customer] = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomers(
          {
            userId: user.id,
            organizationId: (ctx as TRPCContext).organizationId,
          },
          transaction
        )
      }
    )

    if (!customer) {
      throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    return next({
      ctx: {
        user,
        customer,
        path: (ctx as TRPCContext).path,
        environment,
        organizationId: (ctx as TRPCContext).organizationId,
        organization: (ctx as TRPCContext).organization,
        livemode,
      },
    })
  }
)

// Protected procedure with tracing
export const protectedProcedure = baseProcedure.use(isAuthed)

export const devOnlyProcedure = baseProcedure.use(({ next, ctx }) => {
  if (!IS_DEV) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Procedure unavailable',
    })
  }
  return next({ ctx })
})

export const customerProtectedProcedure =
  baseProcedure.use(isCustomerAuthed)
export const customerBillingProtectedProcedure = baseProcedure.use(
  isCustomerBillingAuthed
)

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
