import {
  FlowgladActionKey,
  flowgladActionValidators,
} from '@flowglad/shared'
import type { BetterAuthPlugin } from 'better-auth'
import { getSessionFromCtx } from 'better-auth/api'
import {
  createAuthEndpoint,
  createAuthMiddleware,
} from 'better-auth/plugins'
import { z } from 'zod'
import { FlowgladServer } from './FlowgladServer'
import { routeToHandlerMap } from './subrouteHandlers'

type InnerSession = {
  user: {
    id: string
    name?: string | null
    email?: string | null
    organizationId?: string | null
  }
}

/**
 * The session type returned by getSessionFromCtx in Better Auth.
 * Contains both session and user information.
 */
// Export for testing
export type BetterAuthSessionResult = {
  session: {
    id: string
    userId: string
    activeOrganizationId?: string
    [key: string]: unknown
  }
  user: {
    id: string
    name?: string | null
    email?: string | null
    [key: string]: unknown
  }
}

/**
 * Mapping from camelCase endpoint keys to FlowgladActionKey values.
 * Used for exhaustiveness testing to ensure all action keys have endpoints.
 */
export const endpointKeyToActionKey: Record<
  string,
  FlowgladActionKey
> = {
  getCustomerBilling: FlowgladActionKey.GetCustomerBilling,
  findOrCreateCustomer: FlowgladActionKey.FindOrCreateCustomer,
  createCheckoutSession: FlowgladActionKey.CreateCheckoutSession,
  createAddPaymentMethodCheckoutSession:
    FlowgladActionKey.CreateAddPaymentMethodCheckoutSession,
  createActivateSubscriptionCheckoutSession:
    FlowgladActionKey.CreateActivateSubscriptionCheckoutSession,
  cancelSubscription: FlowgladActionKey.CancelSubscription,
  uncancelSubscription: FlowgladActionKey.UncancelSubscription,
  adjustSubscription: FlowgladActionKey.AdjustSubscription,
  createSubscription: FlowgladActionKey.CreateSubscription,
  updateCustomer: FlowgladActionKey.UpdateCustomer,
  createUsageEvent: FlowgladActionKey.CreateUsageEvent,
}

/**
 * Compile-time exhaustiveness check for endpointKeyToActionKey.
 *
 * This object uses `satisfies` to cause a TypeScript compile error if any
 * FlowgladActionKey value is missing. Unlike `as`, `satisfies` validates
 * without bypassing type checking.
 *
 * When a new FlowgladActionKey is added:
 * 1. TypeScript will error here until you add the mapping
 * 2. The mapping must point to a key that exists in endpointKeyToActionKey
 */
const _actionKeyToEndpointKey = {
  [FlowgladActionKey.GetCustomerBilling]: 'getCustomerBilling',
  [FlowgladActionKey.FindOrCreateCustomer]: 'findOrCreateCustomer',
  [FlowgladActionKey.CreateCheckoutSession]: 'createCheckoutSession',
  [FlowgladActionKey.CreateAddPaymentMethodCheckoutSession]:
    'createAddPaymentMethodCheckoutSession',
  [FlowgladActionKey.CreateActivateSubscriptionCheckoutSession]:
    'createActivateSubscriptionCheckoutSession',
  [FlowgladActionKey.CancelSubscription]: 'cancelSubscription',
  [FlowgladActionKey.UncancelSubscription]: 'uncancelSubscription',
  [FlowgladActionKey.AdjustSubscription]: 'adjustSubscription',
  [FlowgladActionKey.CreateSubscription]: 'createSubscription',
  [FlowgladActionKey.UpdateCustomer]: 'updateCustomer',
  [FlowgladActionKey.CreateUsageEvent]: 'createUsageEvent',
} satisfies Record<
  FlowgladActionKey,
  keyof typeof endpointKeyToActionKey
>

/**
 * Error response format for Better Auth endpoints.
 * Consistent format: { error: { code, message, details? } }
 */
interface FlowgladEndpointError {
  code: string
  message: string
  details?: unknown
}

/**
 * Resolves the customer external ID from a Better Auth session.
 * Returns an error if organization billing is configured but no active organization exists.
 */
// Export for testing
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

export type FlowgladBetterAuthPluginOptions = {
  /**
   * Optional API key. If not provided, reads from FLOWGLAD_SECRET_KEY environment variable.
   */
  apiKey?: string
  /**
   * Optional base URL for Flowglad API. Defaults to https://app.flowglad.com
   */
  baseURL?: string

  /**
   * Type of customer to use. Defaults to "user".
   * - "user": Uses session.user.id as externalId
   * - "organization": Uses session.user.organizationId (requires org plugin)
   */
  customerType?: 'user' | 'organization'

  /**
   * Optional function to extract customer info from Better Auth session.
   * If not provided, defaults to extracting from session.user based on customerType.
   *
   * This gives you full control over:
   * - Which ID to use (user.id, org.id, custom mapping)
   * - How to get name/email (from user, org, or custom logic)
   */
  getCustomer?: (session: InnerSession) => Promise<{
    externalId: string
    name: string
    email: string
  }>
}

/**
 * Flowglad plugin for Better Auth
 *
 * @example
 * ```ts
 * import { betterAuth } from "better-auth"
 * import { flowgladPlugin } from "@flowglad/server/better-auth"
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     flowgladPlugin({
 *       customerType: "user",
 *     })
 *   ]
 * })
 * ```
 */
/**
 * Helper function to get default customer info from Better Auth session
 */
const getDefaultCustomer = async (
  session: InnerSession,
  customerType: 'user' | 'organization'
): Promise<{
  externalId: string
  name: string
  email: string
}> => {
  if (customerType === 'organization') {
    const orgId = session.user.organizationId
    if (!orgId) {
      throw new Error('Organization ID not found in session')
    }
    // For organizations, use organization ID as externalId
    // Use user's name/email as fallback (users can provide custom getCustomer for org-specific logic)
    return {
      externalId: orgId,
      name: session.user.name || 'Organization',
      email: session.user.email || '',
    }
  }

  // Default: use user info from session
  if (!session.user.email) {
    throw new Error(
      'User email is required to create Flowglad customer'
    )
  }
  return {
    externalId: session.user.id,
    name: session.user.name || '',
    email: session.user.email,
  }
}

/**
 * Creates a Flowglad customer after Better Auth user/org creation
 */
const createFlowgladCustomer = async (
  options: FlowgladBetterAuthPluginOptions,
  session: InnerSession
): Promise<void> => {
  const customerType = options.customerType || 'user'

  // Get customer info - use custom function if provided, otherwise use defaults
  const customerInfo = options.getCustomer
    ? await options.getCustomer(session)
    : await getDefaultCustomer(session, customerType)

  // Create Flowglad customer
  const apiKey = options.apiKey || process.env.FLOWGLAD_SECRET_KEY
  const flowgladServerConfig: {
    customerExternalId: string
    getCustomerDetails: () => Promise<{ name: string; email: string }>
    apiKey?: string
    baseURL?: string
  } = {
    customerExternalId: customerInfo.externalId,
    getCustomerDetails: async () => ({
      name: customerInfo.name,
      email: customerInfo.email,
    }),
  }
  if (apiKey) {
    flowgladServerConfig.apiKey = apiKey
  }
  if (options.baseURL) {
    flowgladServerConfig.baseURL = options.baseURL
  }
  const flowgladServer = new FlowgladServer(flowgladServerConfig)

  // This will find or create the customer
  await flowgladServer.findOrCreateCustomer()
}

/**
 * Helper function to create Flowglad customer for an organization
 * Can be called directly when organization is created programmatically
 */
export const createFlowgladCustomerForOrganization = async (
  options: FlowgladBetterAuthPluginOptions,
  organizationId: string,
  userId: string,
  userEmail: string,
  userName?: string | null
): Promise<void> => {
  const session: InnerSession = {
    user: {
      id: userId,
      email: userEmail,
      name: userName || null,
      organizationId,
    },
  }

  await createFlowgladCustomer(options, session)
}

/**
 * Creates a Flowglad endpoint for a given action key.
 * Each endpoint handles authentication, customer resolution, input validation,
 * and delegates to the existing routeToHandlerMap handlers.
 */
const createFlowgladBillingEndpoint = <T extends FlowgladActionKey>(
  actionKey: T,
  options: FlowgladBetterAuthPluginOptions
) => {
  return createAuthEndpoint(
    `/flowglad/${actionKey}`,
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

      // 2. Resolve customer ID with explicit error for missing org
      const customerResult = resolveCustomerExternalId(
        options,
        session
      )
      if ('error' in customerResult) {
        return ctx.json(
          { error: customerResult.error },
          { status: 400 }
        )
      }

      // 3. Get request body (already parsed by Better Call due to body schema)
      // Handlers will do their own validation (consistent with standalone requestHandler)
      const validator = flowgladActionValidators[actionKey]
      const rawBody = ctx.body ?? {}

      // 4. Create FlowgladServer and delegate to handler
      const apiKey = options.apiKey || process.env.FLOWGLAD_SECRET_KEY
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
        getCustomerDetails: async () => ({
          name: session.user.name || '',
          email: session.user.email || '',
        }),
      }
      if (apiKey) {
        flowgladServerConfig.apiKey = apiKey
      }
      if (options.baseURL) {
        flowgladServerConfig.baseURL = options.baseURL
      }

      const flowgladServer = new FlowgladServer(flowgladServerConfig)

      // 5. Call the handler
      const handler = routeToHandlerMap[actionKey]
      // Pass the raw body to the handler - it will do its own validation
      // (consistent with how the standalone requestHandler works)
      const result = await handler(
        {
          method: validator.method,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: rawBody as any,
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

export const flowgladPlugin = (
  options: FlowgladBetterAuthPluginOptions
) => {
  return {
    id: 'flowglad',
    endpoints: {
      // Utility endpoint for getting the external ID
      getExternalId: createAuthEndpoint(
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
          const externalId =
            options.customerType === 'organization' && organizationId
              ? organizationId
              : session.session.userId
          return ctx.json({
            externalId,
          })
        }
      ),

      // Billing endpoints - one for each FlowgladActionKey
      getCustomerBilling: createFlowgladBillingEndpoint(
        FlowgladActionKey.GetCustomerBilling,
        options
      ),
      findOrCreateCustomer: createFlowgladBillingEndpoint(
        FlowgladActionKey.FindOrCreateCustomer,
        options
      ),
      createCheckoutSession: createFlowgladBillingEndpoint(
        FlowgladActionKey.CreateCheckoutSession,
        options
      ),
      createAddPaymentMethodCheckoutSession:
        createFlowgladBillingEndpoint(
          FlowgladActionKey.CreateAddPaymentMethodCheckoutSession,
          options
        ),
      createActivateSubscriptionCheckoutSession:
        createFlowgladBillingEndpoint(
          FlowgladActionKey.CreateActivateSubscriptionCheckoutSession,
          options
        ),
      cancelSubscription: createFlowgladBillingEndpoint(
        FlowgladActionKey.CancelSubscription,
        options
      ),
      uncancelSubscription: createFlowgladBillingEndpoint(
        FlowgladActionKey.UncancelSubscription,
        options
      ),
      adjustSubscription: createFlowgladBillingEndpoint(
        FlowgladActionKey.AdjustSubscription,
        options
      ),
      createSubscription: createFlowgladBillingEndpoint(
        FlowgladActionKey.CreateSubscription,
        options
      ),
      updateCustomer: createFlowgladBillingEndpoint(
        FlowgladActionKey.UpdateCustomer,
        options
      ),
      createUsageEvent: createFlowgladBillingEndpoint(
        FlowgladActionKey.CreateUsageEvent,
        options
      ),
    },
    hooks: {
      after: [
        {
          matcher: (context) => {
            // Match user creation endpoints
            return (
              context.path === '/sign-up' ||
              context.path === '/sign-up/email'
            )
          },
          handler: createAuthMiddleware(async (ctx) => {
            // In after hooks, the user should be available in the context
            // Try to get user from context - Better Auth should have it after sign-up
            const returned = ctx.context.returned as
              | {
                  user?: {
                    id?: string
                    email?: string
                    name?: string
                  }
                }
              | undefined

            if (!returned?.user?.id) {
              // No user created, skip
              return
            }

            // Create a session-like object from the returned user data
            const session: InnerSession = {
              user: {
                id: returned.user.id,
                name: returned.user.name || null,
                email: returned.user.email || null,
                organizationId: null,
              },
            }

            // Only create Flowglad customer if customerType is 'user' or not specified
            const customerType = options.customerType || 'user'
            if (customerType !== 'user') {
              return
            }

            try {
              await createFlowgladCustomer(options, session)
            } catch (error) {
              // Log error but don't fail the sign-up process
              console.error(
                'Failed to create Flowglad customer after sign-up:',
                error
              )
            }
          }),
        },
        {
          matcher: (context) => {
            // Match organization creation endpoint (if using org plugin)
            return context.path === '/organization/create'
          },
          handler: createAuthMiddleware(async (ctx) => {
            // In after hooks, the organization should be available in the context
            // Try to get organization from context - Better Auth should have it after org creation
            const returned = ctx.context.returned as
              | {
                  organization?: {
                    id?: string
                    name?: string
                    slug?: string
                  }
                  member?: {
                    userId?: string
                    organizationId?: string
                  }
                }
              | undefined

            if (!returned?.organization?.id) {
              return
            }

            // Get session from context to get user info
            const session = ctx.context.session
            if (!session?.user) {
              return
            }

            // Only create Flowglad customer if customerType is 'organization'
            const customerType = options.customerType || 'user'
            if (customerType !== 'organization') {
              return
            }

            // Create a session-like object with organization ID
            const orgSession: InnerSession = {
              user: {
                id: session.user.id,
                name: session.user.name || null,
                email: session.user.email || null,
                organizationId: returned.organization.id,
              },
            }

            try {
              await createFlowgladCustomer(options, orgSession)
            } catch (error) {
              // Log error but don't fail the organization creation process
              console.error(
                'Failed to create Flowglad customer after organization creation:',
                error
              )
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin
}
