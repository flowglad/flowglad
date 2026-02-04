import {
  type AuthenticatedActionKey,
  FlowgladActionKey,
  flowgladActionValidators,
  HTTPMethod,
} from '@flowglad/shared'
import { getSessionFromCtx } from 'better-auth/api'
import { createAuthEndpoint } from 'better-auth/plugins'
import { z } from 'zod'
import { FlowgladServer } from '../FlowgladServer'
import { FlowgladServerAdmin } from '../FlowgladServerAdmin'
import { routeToHandlerMap } from '../subrouteHandlers'
import { getPricingModel } from '../subrouteHandlers/pricingModelHandlers'
import type {
  BetterAuthSessionResult,
  FlowgladBetterAuthPluginOptions,
  FlowgladEndpointError,
  InnerSession,
} from './types'

export type AdapterWhereClause = { field: string; value: string }

export type AdapterFindArgs = {
  model: string
  where: AdapterWhereClause[]
}

export type AdapterLike = {
  findOne: (args: AdapterFindArgs) => Promise<unknown>
  findMany: (args: AdapterFindArgs) => Promise<unknown>
}

export const isRecord = (
  value: unknown
): value is Record<string, unknown> => {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

export const getStringProp = (
  record: Record<string, unknown>,
  key: string
): string | null => {
  const value = record[key]
  if (typeof value !== 'string') {
    return null
  }
  return value
}

export const isAdapterLike = (
  value: unknown
): value is AdapterLike => {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.findOne === 'function' &&
    typeof value.findMany === 'function'
  )
}

/**
 * Better Auth's `ctx.context` shape differs across versions/plugins.
 * We access `orgOptions` in a duck-typed, best-effort way to avoid
 * coupling Flowglad's plugin types to Better Auth internals.
 */
export const getOrgOptionsFromCtxContext = (
  ctxContext: unknown
): Record<string, unknown> | undefined => {
  if (!isRecord(ctxContext)) {
    return undefined
  }
  const orgOptions = ctxContext.orgOptions
  if (!isRecord(orgOptions)) {
    return undefined
  }
  return orgOptions
}

export const getCreatorRoleFromOrgOptions = (
  orgOptions: Record<string, unknown> | undefined
): string | undefined => {
  if (!orgOptions) {
    return undefined
  }
  const creatorRole = orgOptions.creatorRole
  return typeof creatorRole === 'string' ? creatorRole : undefined
}

/**
 * Best-effort organization lookup via Better Auth adapter.
 *
 * Returns null if the current user is not a member of the organization.
 * If the org exists but owner email can't be determined, email may be "".
 *
 * Parallelizes the first three queries (member check, org lookup, owner members)
 * to reduce database round trips from 3 to 2 in the worst case. This trades
 * potentially executing unnecessary queries (if user isn't a member) for
 * reduced latency in the common case.
 *
 * Exported for testing.
 */
export const getOrganizationDetails = async (params: {
  adapter: AdapterLike
  organizationId: string
  userId: string
  creatorRole?: string
}): Promise<{ id: string; name: string; email: string } | null> => {
  const creatorRole = params.creatorRole ?? 'owner'

  // Parallel: member check, org lookup, owner members (round trip 1)
  const [memberResult, organizationResult, ownerMembersResult] =
    await Promise.all([
      params.adapter.findOne({
        model: 'member',
        where: [
          { field: 'userId', value: params.userId },
          { field: 'organizationId', value: params.organizationId },
        ],
      }),
      params.adapter.findOne({
        model: 'organization',
        where: [{ field: 'id', value: params.organizationId }],
      }),
      params.adapter.findMany({
        model: 'member',
        where: [
          { field: 'organizationId', value: params.organizationId },
          { field: 'role', value: creatorRole },
        ],
      }),
    ])

  // Early exit if not a member (queries 2&3 were "wasted" but no extra round trip)
  if (!isRecord(memberResult)) {
    return null
  }

  // Determine owner user ID
  const memberRole = getStringProp(memberResult, 'role')
  const memberUserId =
    getStringProp(memberResult, 'userId') ?? params.userId
  let ownerUserId: string | null =
    memberRole === creatorRole ? memberUserId : null

  if (!ownerUserId && Array.isArray(ownerMembersResult)) {
    const firstOwner = ownerMembersResult.find(isRecord) ?? null
    ownerUserId = firstOwner
      ? getStringProp(firstOwner, 'userId')
      : null
  }

  // Single additional query for owner user if needed (round trip 2)
  const ownerUserResult = ownerUserId
    ? await params.adapter.findOne({
        model: 'user',
        where: [{ field: 'id', value: ownerUserId }],
      })
    : null

  const organizationName = isRecord(organizationResult)
    ? (getStringProp(organizationResult, 'name') ??
      getStringProp(organizationResult, 'slug') ??
      'Organization')
    : 'Organization'

  const ownerEmail = isRecord(ownerUserResult)
    ? (getStringProp(ownerUserResult, 'email') ?? '')
    : ''

  return {
    id: params.organizationId,
    name: organizationName,
    email: ownerEmail,
  }
}

export const createGetCustomerDetails = (params: {
  options: FlowgladBetterAuthPluginOptions
  session: BetterAuthSessionResult
  ctxContext: unknown
  adapter: unknown
}): (() => Promise<{ name: string; email: string }>) => {
  return async () => {
    const organizationId =
      params.options.customerType === 'organization'
        ? (params.session.session.activeOrganizationId ?? null)
        : null

    const innerSession: InnerSession = {
      user: {
        id: params.session.user.id,
        name: params.session.user.name || '',
        email: params.session.user.email || '',
        organizationId,
      },
    }

    if (params.options.getCustomer) {
      const customerInfo =
        await params.options.getCustomer(innerSession)
      return { name: customerInfo.name, email: customerInfo.email }
    }

    if (
      params.options.customerType === 'organization' &&
      params.session.session.activeOrganizationId &&
      isAdapterLike(params.adapter)
    ) {
      const creatorRole = getCreatorRoleFromOrgOptions(
        getOrgOptionsFromCtxContext(params.ctxContext)
      )

      const org = await getOrganizationDetails({
        adapter: params.adapter,
        organizationId: params.session.session.activeOrganizationId,
        userId: params.session.user.id,
        creatorRole,
      })

      if (org) {
        return { name: org.name, email: org.email }
      }
    }

    return {
      name: params.session.user.name || '',
      email: params.session.user.email || '',
    }
  }
}

/**
 * Resolves the customer external ID from a Better Auth session.
 * Returns an error if organization billing is configured but no active organization exists.
 */
export const resolveCustomerExternalId = (
  options: FlowgladBetterAuthPluginOptions,
  session: BetterAuthSessionResult
): { externalId: string } | { error: FlowgladEndpointError } => {
  if (options.customerType === 'organization') {
    if (!session.session.activeOrganizationId) {
      return {
        error: {
          code: 'NO_ACTIVE_ORGANIZATION',
          message:
            'Organization billing requires an active organization. Please select or create an organization first.',
        },
      }
    }
    return { externalId: session.session.activeOrganizationId }
  }
  return { externalId: session.session.userId }
}

export const createGetExternalIdEndpoint = (
  options: FlowgladBetterAuthPluginOptions
) => {
  return createAuthEndpoint(
    '/flowglad/get-external-id',
    {
      method: 'GET',
      metadata: {
        isAction: true,
      },
    },
    async (ctx) => {
      if (!ctx.headers || !ctx.headers.get) {
        throw new Error(
          'Flowglad Better Auth Plugin: Headers are required for getExternalId().\n' +
            'Usage: await auth.api.getExternalId({ headers: await headers() })'
        )
      }
      const session = await getSessionFromCtx(ctx)
      if (!session) {
        return ctx.json({
          externalId: null,
        })
      }
      const organizationId: string | undefined =
        session.session.activeOrganizationId

      if (options.customerType === 'organization') {
        return ctx.json({
          externalId: organizationId ?? null,
        })
      }

      return ctx.json({
        externalId: session.session.userId,
      })
    }
  )
}

const createFlowgladBillingEndpoint = <
  T extends AuthenticatedActionKey,
  S extends z.ZodTypeAny,
>(params: {
  actionKey: T
  validator: {
    method: (typeof flowgladActionValidators)[T]['method']
    inputValidator: S
  }
  handler: (
    params: {
      method: (typeof flowgladActionValidators)[T]['method']
      data: z.output<S>
    },
    flowgladServer: FlowgladServer
  ) => Promise<{
    data: {}
    status: number
    error?: {
      code: string
      json: Record<string, unknown>
    }
  }>
  options: FlowgladBetterAuthPluginOptions
}) => {
  return createAuthEndpoint(
    `/flowglad/${params.actionKey}`,
    {
      method: 'POST',
      // Use a permissive schema so Better Call parses the JSON body for us
      // Handlers will do their own validation
      body: z.record(z.string(), z.any()),
      metadata: {
        isAction: true,
      },
    },
    async (ctx) => {
      // 1. Authenticate
      const sessionResult = await getSessionFromCtx(ctx)
      if (!sessionResult) {
        return ctx.json(
          {
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
            },
          },
          { status: 401 }
        )
      }

      // Cast to our expected session type
      const session =
        sessionResult as unknown as BetterAuthSessionResult

      const getCustomerDetailsForSession = createGetCustomerDetails({
        options: params.options,
        session,
        ctxContext: ctx.context,
        adapter: ctx.context.adapter,
      })

      // 2. Resolve customer ID with explicit error for missing org
      const customerResult = resolveCustomerExternalId(
        params.options,
        session
      )
      if ('error' in customerResult) {
        return ctx.json(
          { error: customerResult.error },
          { status: 400 }
        )
      }

      // 2b. Defense-in-depth: verify user membership for organization billing
      // Better Auth should enforce this when setting activeOrganizationId,
      // but explicit verification guards against session manipulation or bugs
      if (
        params.options.customerType === 'organization' &&
        isAdapterLike(ctx.context.adapter)
      ) {
        const membership = await ctx.context.adapter.findOne({
          model: 'member',
          where: [
            { field: 'userId', value: session.user.id },
            {
              field: 'organizationId',
              value: customerResult.externalId,
            },
          ],
        })
        if (!isRecord(membership)) {
          return ctx.json(
            {
              error: {
                code: 'NOT_ORGANIZATION_MEMBER',
                message: 'You are not a member of this organization',
              },
            },
            { status: 403 }
          )
        }
      }

      // 3. Get request body (already parsed by Better Call due to body schema)
      // Handlers will do their own validation (consistent with standalone requestHandler)
      const rawBody: Record<string, unknown> = isRecord(ctx.body)
        ? ctx.body
        : {}

      /**
       * IMPORTANT: In Flowglad's action schemas, `externalId` is overloaded:
       * - For customer endpoints it refers to the *customer externalId* (derived from session)
       * - For resource-claim endpoints it refers to the *claim externalId* (user-provided)
       *
       * So we must ONLY inject the customer externalId for the small set of endpoints
       * that are explicitly defined to take it, otherwise we overwrite legitimate inputs
       * (e.g. `claimResource({ externalId: inviteeEmail })`).
       */
      const shouldInjectCustomerExternalIdIntoBody =
        params.actionKey === FlowgladActionKey.GetCustomerBilling ||
        params.actionKey === FlowgladActionKey.FindOrCreateCustomer ||
        params.actionKey === FlowgladActionKey.UpdateCustomer

      const bodyForValidation: Record<string, unknown> =
        shouldInjectCustomerExternalIdIntoBody
          ? {
              ...rawBody,
              externalId: customerResult.externalId,
            }
          : rawBody

      const validatedBody =
        params.validator.inputValidator.safeParse(bodyForValidation)
      if (!validatedBody.success) {
        return ctx.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid request body',
              details: validatedBody.error.flatten(),
            },
          },
          { status: 400 }
        )
      }

      // 4. Create FlowgladServer and delegate to handler
      const apiKey =
        params.options.apiKey || process.env.FLOWGLAD_SECRET_KEY
      const flowgladServerConfig: {
        customerExternalId: string
        getCustomerDetails: () => Promise<{
          name: string
          email: string
        }>
        apiKey?: string
        baseURL?: string
      } = {
        customerExternalId: customerResult.externalId,
        getCustomerDetails: getCustomerDetailsForSession,
      }
      if (apiKey) {
        flowgladServerConfig.apiKey = apiKey
      }
      if (params.options.baseURL) {
        flowgladServerConfig.baseURL = params.options.baseURL
      }

      const flowgladServer = new FlowgladServer(flowgladServerConfig)

      // 5. Call the handler
      const result = await params.handler(
        {
          method: params.validator.method,
          data: validatedBody.data,
        },
        flowgladServer
      )

      if (result.error) {
        return ctx.json(
          {
            error: {
              code: result.error.code,
              message:
                typeof result.error.json?.message === 'string'
                  ? result.error.json.message
                  : `Flowglad API error: ${result.error.code}`,
              details: result.error.json,
            },
          },
          { status: result.status }
        )
      }

      return ctx.json(
        { data: result.data },
        { status: result.status }
      )
    }
  )
}

export const createGetPricingModelEndpoint = (
  options: FlowgladBetterAuthPluginOptions
) => {
  return createAuthEndpoint(
    '/flowglad/pricing-models/retrieve',
    {
      method: 'POST',
      metadata: {
        isAction: true,
      },
    },
    async (ctx) => {
      const apiKey = options.apiKey || process.env.FLOWGLAD_SECRET_KEY
      if (!apiKey) {
        return ctx.json(
          {
            error: {
              code: 'CONFIGURATION_ERROR',
              message:
                'API key required. Provide apiKey option or set FLOWGLAD_SECRET_KEY.',
            },
          },
          { status: 500 }
        )
      }

      // Create FlowgladServerAdmin (always needed for fallback)
      const flowgladServerAdmin = new FlowgladServerAdmin({
        apiKey,
        baseURL: options.baseURL,
      })

      // Attempt authentication to determine if we have an authenticated user
      let flowgladServer: FlowgladServer | null = null

      const sessionResult = await getSessionFromCtx(ctx)
      if (sessionResult) {
        const session =
          sessionResult as unknown as BetterAuthSessionResult
        const customerResult = resolveCustomerExternalId(
          options,
          session
        )

        // Only create FlowgladServer if customer resolution succeeded
        if (!('error' in customerResult)) {
          const getCustomerDetailsForSession =
            createGetCustomerDetails({
              options,
              session,
              ctxContext: ctx.context,
              adapter: ctx.context.adapter,
            })

          const flowgladServerConfig: {
            customerExternalId: string
            getCustomerDetails: () => Promise<{
              name: string
              email: string
            }>
            apiKey?: string
            baseURL?: string
          } = {
            customerExternalId: customerResult.externalId,
            getCustomerDetails: getCustomerDetailsForSession,
          }
          if (apiKey) {
            flowgladServerConfig.apiKey = apiKey
          }
          if (options.baseURL) {
            flowgladServerConfig.baseURL = options.baseURL
          }
          flowgladServer = new FlowgladServer(flowgladServerConfig)
        }
      }

      // Delegate to the shared handler
      const result = await getPricingModel(
        { method: HTTPMethod.POST, data: {} },
        { flowgladServer, flowgladServerAdmin }
      )

      // Map handler response to better-auth response format
      if (result.error) {
        const errorJson = result.error.json
        const message =
          typeof errorJson?.message === 'string'
            ? errorJson.message
            : undefined
        const details =
          typeof errorJson?.details === 'string'
            ? errorJson.details
            : undefined
        return ctx.json(
          {
            error: {
              code: result.error.code,
              message,
              details,
            },
          },
          { status: result.status }
        )
      }

      return ctx.json({ data: result.data })
    }
  )
}

export const createBillingEndpoints = (
  options: FlowgladBetterAuthPluginOptions
) => {
  return {
    getCustomerBilling: createFlowgladBillingEndpoint({
      actionKey: FlowgladActionKey.GetCustomerBilling,
      validator:
        flowgladActionValidators[
          FlowgladActionKey.GetCustomerBilling
        ],
      handler:
        routeToHandlerMap[FlowgladActionKey.GetCustomerBilling],
      options,
    }),
    findOrCreateCustomer: createFlowgladBillingEndpoint({
      actionKey: FlowgladActionKey.FindOrCreateCustomer,
      validator:
        flowgladActionValidators[
          FlowgladActionKey.FindOrCreateCustomer
        ],
      handler:
        routeToHandlerMap[FlowgladActionKey.FindOrCreateCustomer],
      options,
    }),
    createCheckoutSession: createFlowgladBillingEndpoint({
      actionKey: FlowgladActionKey.CreateCheckoutSession,
      validator:
        flowgladActionValidators[
          FlowgladActionKey.CreateCheckoutSession
        ],
      handler:
        routeToHandlerMap[FlowgladActionKey.CreateCheckoutSession],
      options,
    }),
    createAddPaymentMethodCheckoutSession:
      createFlowgladBillingEndpoint({
        actionKey:
          FlowgladActionKey.CreateAddPaymentMethodCheckoutSession,
        validator:
          flowgladActionValidators[
            FlowgladActionKey.CreateAddPaymentMethodCheckoutSession
          ],
        handler:
          routeToHandlerMap[
            FlowgladActionKey.CreateAddPaymentMethodCheckoutSession
          ],
        options,
      }),
    createActivateSubscriptionCheckoutSession:
      createFlowgladBillingEndpoint({
        actionKey:
          FlowgladActionKey.CreateActivateSubscriptionCheckoutSession,
        validator:
          flowgladActionValidators[
            FlowgladActionKey
              .CreateActivateSubscriptionCheckoutSession
          ],
        handler:
          routeToHandlerMap[
            FlowgladActionKey
              .CreateActivateSubscriptionCheckoutSession
          ],
        options,
      }),
    cancelSubscription: createFlowgladBillingEndpoint({
      actionKey: FlowgladActionKey.CancelSubscription,
      validator:
        flowgladActionValidators[
          FlowgladActionKey.CancelSubscription
        ],
      handler:
        routeToHandlerMap[FlowgladActionKey.CancelSubscription],
      options,
    }),
    uncancelSubscription: createFlowgladBillingEndpoint({
      actionKey: FlowgladActionKey.UncancelSubscription,
      validator:
        flowgladActionValidators[
          FlowgladActionKey.UncancelSubscription
        ],
      handler:
        routeToHandlerMap[FlowgladActionKey.UncancelSubscription],
      options,
    }),
    adjustSubscription: createFlowgladBillingEndpoint({
      actionKey: FlowgladActionKey.AdjustSubscription,
      validator:
        flowgladActionValidators[
          FlowgladActionKey.AdjustSubscription
        ],
      handler:
        routeToHandlerMap[FlowgladActionKey.AdjustSubscription],
      options,
    }),
    createSubscription: createFlowgladBillingEndpoint({
      actionKey: FlowgladActionKey.CreateSubscription,
      validator:
        flowgladActionValidators[
          FlowgladActionKey.CreateSubscription
        ],
      handler:
        routeToHandlerMap[FlowgladActionKey.CreateSubscription],
      options,
    }),
    getSubscriptions: createFlowgladBillingEndpoint({
      actionKey: FlowgladActionKey.GetSubscriptions,
      validator:
        flowgladActionValidators[FlowgladActionKey.GetSubscriptions],
      handler: routeToHandlerMap[FlowgladActionKey.GetSubscriptions],
      options,
    }),
    updateCustomer: createFlowgladBillingEndpoint({
      actionKey: FlowgladActionKey.UpdateCustomer,
      validator:
        flowgladActionValidators[FlowgladActionKey.UpdateCustomer],
      handler: routeToHandlerMap[FlowgladActionKey.UpdateCustomer],
      options,
    }),
    createUsageEvent: createFlowgladBillingEndpoint({
      actionKey: FlowgladActionKey.CreateUsageEvent,
      validator:
        flowgladActionValidators[FlowgladActionKey.CreateUsageEvent],
      handler: routeToHandlerMap[FlowgladActionKey.CreateUsageEvent],
      options,
    }),
    // Resource claim endpoints
    getResources: createFlowgladBillingEndpoint({
      actionKey: FlowgladActionKey.GetResourceUsages,
      validator:
        flowgladActionValidators[FlowgladActionKey.GetResourceUsages],
      handler: routeToHandlerMap[FlowgladActionKey.GetResourceUsages],
      options,
    }),
    getResourceUsage: createFlowgladBillingEndpoint({
      actionKey: FlowgladActionKey.GetResourceUsage,
      validator:
        flowgladActionValidators[FlowgladActionKey.GetResourceUsage],
      handler: routeToHandlerMap[FlowgladActionKey.GetResourceUsage],
      options,
    }),
    claimResource: createFlowgladBillingEndpoint({
      actionKey: FlowgladActionKey.ClaimResource,
      validator:
        flowgladActionValidators[FlowgladActionKey.ClaimResource],
      handler: routeToHandlerMap[FlowgladActionKey.ClaimResource],
      options,
    }),
    releaseResource: createFlowgladBillingEndpoint({
      actionKey: FlowgladActionKey.ReleaseResource,
      validator:
        flowgladActionValidators[FlowgladActionKey.ReleaseResource],
      handler: routeToHandlerMap[FlowgladActionKey.ReleaseResource],
      options,
    }),
    listResourceClaims: createFlowgladBillingEndpoint({
      actionKey: FlowgladActionKey.ListResourceClaims,
      validator:
        flowgladActionValidators[
          FlowgladActionKey.ListResourceClaims
        ],
      handler:
        routeToHandlerMap[FlowgladActionKey.ListResourceClaims],
      options,
    }),
    // Usage meter endpoints
    getUsageMeterBalances: createFlowgladBillingEndpoint({
      actionKey: FlowgladActionKey.GetUsageMeterBalances,
      validator:
        flowgladActionValidators[
          FlowgladActionKey.GetUsageMeterBalances
        ],
      handler:
        routeToHandlerMap[FlowgladActionKey.GetUsageMeterBalances],
      options,
    }),
    // Feature access endpoints
    getFeatureAccess: createFlowgladBillingEndpoint({
      actionKey: FlowgladActionKey.GetFeatureAccess,
      validator:
        flowgladActionValidators[FlowgladActionKey.GetFeatureAccess],
      handler: routeToHandlerMap[FlowgladActionKey.GetFeatureAccess],
      options,
    }),
    // Payment method endpoints
    getPaymentMethods: createFlowgladBillingEndpoint({
      actionKey: FlowgladActionKey.GetPaymentMethods,
      validator:
        flowgladActionValidators[FlowgladActionKey.GetPaymentMethods],
      handler: routeToHandlerMap[FlowgladActionKey.GetPaymentMethods],
      options,
    }),
    // Customer details endpoint
    getCustomerDetails: createFlowgladBillingEndpoint({
      actionKey: FlowgladActionKey.GetCustomerDetails,
      validator:
        flowgladActionValidators[
          FlowgladActionKey.GetCustomerDetails
        ],
      handler:
        routeToHandlerMap[FlowgladActionKey.GetCustomerDetails],
      options,
    }),
  }
}
