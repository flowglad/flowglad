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
import { hasFeatureFlag } from '@/utils/organizationHelpers'
import { t } from './coreTrpcObject'
import { createTracingMiddleware } from './tracingMiddleware'
import type {
  TRPCApiContext,
  TRPCContext,
  TRPCCustomerContext,
} from './trpcContext'

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
 * This middleware is for MERCHANT scope only.
 *
 * Supports two authentication modes:
 * 1. API key authentication: If `isApi` is true, allows API key access
 * 2. User authentication: Requires a logged-in user with merchant session
 *
 * Uses organization from context (set by middleware/auth from user's focused membership).
 *
 * @returns Context with user (or API auth), organization, environment info, and authScope
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
        authScope: 'merchant' as const,
      },
    })
  }
  const user = (ctx as TRPCContext).user
  if (!user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }

  // Verify session scope is 'merchant' (merchant context only accepts merchant sessions)
  const authScope = (ctx as TRPCContext).authScope
  if (authScope !== 'merchant') {
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
      authScope: 'merchant' as const,
    },
  })
})

/**
 * Authentication middleware for customer billing portal operations.
 * This middleware is for CUSTOMER scope only.
 *
 * Authenticates logged-in users with customer sessions and validates their access
 * to customer profiles. Supports multi-customer scenarios where users can have
 * multiple customer profiles within the same organization.
 *
 * The middleware:
 * - Rejects API key authentication (customer routes are user-only)
 * - Requires a logged-in user with customer session (scope='customer')
 * - Gets the organization ID from the customer session's contextOrganizationId
 * - Requires `customerId` in the request input
 * - Queries the database to find a matching customer for the user and organization
 * - Validates the user has access to that specific customer
 * - Adds the customer and organization to the context for use in procedures
 *
 * @param getRawInput - Used to extract required `customerId` from request input
 * @returns Context with user, customer, organization, environment info, and authScope
 * @throws {TRPCError} UNAUTHORIZED if no user, wrong session scope, or user doesn't have access to customer
 */
const isCustomerAuthed = t.middleware(
  async ({ next, ctx, getRawInput }) => {
    // API keys are merchant-only; reject them for customer procedures
    const { isApi } = ctx as TRPCApiContext
    if (isApi) {
      throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    // Verify session scope is 'customer' (customer context only accepts customer sessions)
    const customerCtx = ctx as TRPCCustomerContext
    const authScope = customerCtx.authScope
    if (authScope !== 'customer') {
      throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    const user = customerCtx.user
    if (!user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' })
    }

    // Get organizationId from customer session's contextOrganizationId
    const organizationId = customerCtx.organizationId
    if (!organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Customer session missing organizationId context',
      })
    }

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
        path: customerCtx.path,
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
