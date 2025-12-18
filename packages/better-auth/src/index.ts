import { FlowgladServer } from '@flowglad/server'
import type { BetterAuthPlugin } from 'better-auth'
import { getSessionFromCtx } from 'better-auth/api'
import {
  createAuthEndpoint,
  createAuthMiddleware,
} from 'better-auth/plugins'

type InnerSession = {
  user: {
    id: string
    name?: string | null
    email?: string | null
    organizationId?: string | null
  }
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
 * import { flowgladPlugin } from "@flowglad/better-auth-plugin"
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
    // For organizations, we'd need to query the db, but for now use session data
    // Users can provide custom getCustomer function for org-specific logic
    return {
      externalId: orgId,
      name: session.user.name || '',
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

export const flowgladPlugin = (
  options: FlowgladBetterAuthPluginOptions
) => {
  return {
    id: 'flowglad',
    endpoints: {
      getExternalId: createAuthEndpoint(
        '/flowglad/get-external-id',
        {
          method: 'GET',
          metadata: {
            isAction: true,
          },
        },
        async (ctx) => {
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
                    email?: string
                  }
                }
              | undefined

            if (!returned?.organization?.id) {
              // No organization created, skip
              return
            }

            // Get session from context to get user info
            const session = ctx.context.session
            if (!session?.user) {
              // No session available, skip
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

            // Only create Flowglad customer if customerType is 'organization'
            const customerType = options.customerType || 'user'
            if (customerType !== 'organization') {
              return
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

/**
 *
 * @param session - Better Auth session
 * @returns Customer external ID
 */
export const getCustomerExternalId = (session: InnerSession) => {
  if (session.user.organizationId) {
    return session.user.organizationId
  }
  return session.user.id
}
