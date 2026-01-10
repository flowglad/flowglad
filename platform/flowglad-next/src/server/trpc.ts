// trpc.ts
export const runtime = 'nodejs' // Force Node.js runtime

import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerAndOrganizationByCustomerWhere } from '@/db/tableMethods/customerMethods'
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

/**
 * Authentication middleware for general webapp and API key access.
 *
 * Supports two authentication modes:
 * 1. API key authentication: If `isApi` is true, allows API key access
 * 2. User authentication: Requires a logged-in user
 *
 * Uses organization from context (set by middleware/auth from user's focused membership).
 *
 * @returns Context with user (or API auth), organization, and environment info
 * @throws {TRPCError} UNAUTHORIZED if no user and not API key request
 */
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

/**
 * Authentication middleware for customer billing portal operations.
 *
 * Authenticates logged-in users and validates their access to customer profiles.
 * Supports multi-customer scenarios where users can have multiple customer profiles
 * within the same organization.
 *
 * The middleware:
 * - Requires a logged-in user (no API key support)
 * - Gets the organization ID from the billing portal cookie state
 * - Requires `customerId` in the request input
 * - Queries the database to find a matching customer for the user and organization
 * - Validates the user has access to that specific customer
 * - Adds the customer and organization to the context for use in procedures
 *
 * @param getRawInput - Used to extract required `customerId` from request input
 * @returns Context with user, customer, organization, and environment info
 * @throws {TRPCError} UNAUTHORIZED if no user or user doesn't have access to customer
 */
const isCustomerAuthed = t.middleware(
  async ({ next, ctx, getRawInput }) => {
    const { environment } = ctx as TRPCApiContext
    const livemode = environment === 'live'
    const user = (ctx as TRPCContext).user
    if (!user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' })
    }
    const organizationId =
      await getCustomerBillingPortalOrganizationId()

    // Extract customerId from raw input to populate ctx.customer and ctx.organization.
    // Middleware runs before input validation, so we must use getRawInput() instead of validated input.
    const rawInput = await getRawInput()
    const customerIdSchema = z.object({
      customerId: z.string(),
    })

    const parsed = customerIdSchema.safeParse(rawInput)
    if (!parsed.success) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'customerId is required',
      })
    }

    const customerId = parsed.data.customerId

    const [customerAndOrganization] = await adminTransaction(
      async ({ transaction }) => {
        return selectCustomerAndOrganizationByCustomerWhere(
          {
            userId: user.id,
            organizationId,
            id: customerId,
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
  }
)

// Protected procedure with tracing
export const protectedProcedure = baseProcedure.use(isAuthed)

export const devOnlyProcedure = baseProcedure
  .use(isAuthed)
  .use(({ next, ctx }) => {
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
