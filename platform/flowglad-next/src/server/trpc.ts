// trpc.ts
export const runtime = 'nodejs' // Force Node.js runtime

import { NotFoundError as DBNotFoundError } from '@db-core/tableUtils'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerAndOrganizationByCustomerWhere } from '@/db/tableMethods/customerMethods'
import {
  AuthorizationError,
  ConflictError,
  NotFoundError as DomainNotFoundError,
  TerminalStateError,
  ValidationError,
} from '@/errors'
import type { FeatureFlag } from '@/types'
import { IS_DEV } from '@/utils/core'
import { getCustomerBillingPortalOrganizationId } from '@/utils/customerBillingPortalState'
import { hasFeatureFlag } from '@/utils/organizationHelpers'
import { t } from './coreTrpcObject'
import { createTracingMiddleware } from './tracingMiddleware'
import type { TRPCApiContext, TRPCContext, TRPCCustomerContext } from './trpcContext'

// Create tracing middleware factory
const tracingMiddlewareFactory = createTracingMiddleware()

// Create tracing middleware for this tRPC instance
const tracingMiddleware = tracingMiddlewareFactory(t)

/**
 * Middleware that converts domain errors to TRPCErrors with appropriate HTTP status codes.
 * This ensures that business logic errors result in correct HTTP responses:
 * - NotFoundError (domain) → 404 NOT_FOUND
 * - NotFoundError (DB/tableUtils) → 404 NOT_FOUND
 * - ValidationError → 400 BAD_REQUEST
 * - TerminalStateError → 400 BAD_REQUEST
 * - ConflictError → 409 CONFLICT
 * - AuthorizationError → 403 FORBIDDEN
 */
const domainErrorMiddleware = t.middleware(async ({ next }) => {
  try {
    return await next()
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error
    }
    if (error instanceof DomainNotFoundError) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: error.message,
        cause: error,
      })
    }
    if (error instanceof DBNotFoundError) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: error.message,
        cause: error,
      })
    }
    if (error instanceof ValidationError) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: error.message,
        cause: error,
      })
    }
    if (error instanceof TerminalStateError) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: error.message,
        cause: error,
      })
    }
    if (error instanceof ConflictError) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: error.message,
        cause: error,
      })
    }
    if (error instanceof AuthorizationError) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: error.message,
        cause: error,
      })
    }
    throw error
  }
})

export const router = t.router

// Apply tracing and domain error middleware to base procedure
const baseProcedure = t.procedure
  .use(tracingMiddleware)
  .use(domainErrorMiddleware)

// Public procedure with tracing
export const publicProcedure = baseProcedure

/**
 * Authentication middleware for general webapp and API key access.
 *
 * Supports two authentication modes:
 * 1. API key authentication: If `isApi` is true, allows API key access
 * 2. User authentication: Requires a logged-in user with merchant scope
 *
 * Uses organization from context (set by middleware/auth from user's focused membership).
 *
 * @returns Context with user (or API auth), organization, and environment info
 * @throws {TRPCError} UNAUTHORIZED if no user, wrong scope, or not API key request
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
  const session = (ctx as TRPCContext).session

  // Reject if no user or if session has wrong scope
  if (!user || (session?.session?.scope && session.session.scope !== 'merchant')) {
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
 * Authenticates logged-in users with customer scope and validates their access
 * to customer profiles. Uses the customer session context organization.
 *
 * The middleware:
 * - Requires a logged-in user with customer scope (no API key support)
 * - Gets organization ID from customer session's contextOrganizationId
 * - Requires `customerId` in the request input
 * - Queries the database to find a matching customer for the user and organization
 * - Validates the user has access to that specific customer
 * - Adds the customer and organization to the context for use in procedures
 *
 * @param getRawInput - Used to extract required `customerId` from request input
 * @returns Context with user, customer, organization, and environment info
 * @throws {TRPCError} UNAUTHORIZED if no user, wrong scope, or no access to customer
 */
const isCustomerAuthed = t.middleware(
  async ({ next, ctx, getRawInput }) => {
    // API keys are merchant-only
    if ((ctx as TRPCApiContext).apiKey) {
      throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    // Use customer session from context (avoid re-fetch)
    const session = (ctx as TRPCCustomerContext).session
    const user = (ctx as TRPCCustomerContext).user

    if (!user || !session?.user || session.session?.scope !== 'customer') {
      throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    // Get organizationId from customer session's contextOrganizationId
    const organizationId = session.session?.contextOrganizationId
    if (!organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Customer session missing organizationId context'
      })
    }

    // Validate route context matches session context
    const rawInput = await getRawInput()
    const routeOrganizationIdSchema = z.object({
      organizationId: z.string().optional(),
    })

    const parsedRoute = routeOrganizationIdSchema.safeParse(rawInput)
    if (parsedRoute.success && parsedRoute.data.organizationId) {
      if (parsedRoute.data.organizationId !== organizationId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message:
            'Customer session does not match billing portal organization',
        })
      }
    }

    // Extract customerId from raw input to populate ctx.customer and ctx.organization.
    // Middleware runs before input validation, so we must use getRawInput() instead of validated input.
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
        path: (ctx as TRPCCustomerContext).path,
        environment: 'live' as const,
        organizationId,
        livemode: true,
        authScope: 'customer' as const,
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
