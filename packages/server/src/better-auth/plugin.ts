import { createAuthMiddleware } from 'better-auth/plugins'
import { FlowgladServer } from '../FlowgladServer'
import {
  createBillingEndpoints,
  createGetExternalIdEndpoint,
  createGetPricingModelEndpoint,
  getCreatorRoleFromOrgOptions,
  getOrganizationDetails,
  getOrgOptionsFromCtxContext,
  isAdapterLike,
} from './endpoints'
import type {
  FlowgladBetterAuthPluginOptions,
  InnerSession,
} from './types'

type BetterAuthPluginType = import('better-auth').BetterAuthPlugin
type FlowgladPlugin = BetterAuthPluginType & {
  id: 'flowglad'
  endpoints: NonNullable<BetterAuthPluginType['endpoints']>
  hooks: NonNullable<BetterAuthPluginType['hooks']> & {
    after: NonNullable<
      NonNullable<BetterAuthPluginType['hooks']>['after']
    >
  }
}

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

const reportCustomerCreateError = async (
  options: FlowgladBetterAuthPluginOptions,
  params: {
    hook: 'afterSignUp' | 'afterOrganizationCreate'
    customerType: 'user' | 'organization'
    session: InnerSession
    error: unknown
  }
): Promise<void> => {
  if (options.onCustomerCreateError) {
    await options.onCustomerCreateError(params)
    return
  }

  if (params.hook === 'afterSignUp') {
    console.error(
      'Failed to create Flowglad customer after sign-up:',
      params.error
    )
    return
  }

  console.error(
    'Failed to create Flowglad customer after organization creation:',
    params.error
  )
}

/**
 * Helper function to create Flowglad customer for an organization
 * Can be called directly when organization is created programmatically
 */
export const createFlowgladCustomerForOrganization = async (
  options: FlowgladBetterAuthPluginOptions,
  params: {
    organizationId: string
    userId: string
    userEmail: string
    userName?: string | null
    organizationName?: string
    organizationEmail?: string
  }
): Promise<void> => {
  const {
    organizationId,
    userId,
    userEmail,
    userName,
    organizationName,
    organizationEmail,
  } = params
  const session: InnerSession = {
    user: {
      id: userId,
      email: organizationEmail ?? userEmail,
      name: organizationName ?? userName ?? null,
      organizationId,
    },
  }

  await createFlowgladCustomer(options, session)
}

export const flowgladPlugin = (
  options: FlowgladBetterAuthPluginOptions
) => {
  const plugin = {
    id: 'flowglad',
    endpoints: {
      getExternalId: createGetExternalIdEndpoint(options),
      ...createBillingEndpoints(options),
      getPricingModel: createGetPricingModelEndpoint(options),
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
              // Best-effort: do not fail the sign-up process
              await reportCustomerCreateError(options, {
                hook: 'afterSignUp',
                customerType,
                session,
                error,
              })
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

            const organizationId = returned.organization.id
            const organizationName =
              typeof returned.organization.name === 'string'
                ? returned.organization.name
                : 'Organization'

            const organizationEmail =
              isAdapterLike(ctx.context.adapter) &&
              typeof session.user.id === 'string'
                ? ((
                    await getOrganizationDetails({
                      adapter: ctx.context.adapter,
                      organizationId,
                      userId: session.user.id,
                      creatorRole: getCreatorRoleFromOrgOptions(
                        getOrgOptionsFromCtxContext(ctx.context)
                      ),
                    })
                  )?.email ??
                  session.user.email ??
                  null)
                : (session.user.email ?? null)

            // Create a session-like object with organization ID
            const orgSession: InnerSession = {
              user: {
                id: session.user.id,
                // For org customers, we want Flowglad customer name/email to
                // default to org name + owner email (best-effort).
                name: organizationName,
                email: organizationEmail,
                organizationId,
              },
            }

            try {
              await createFlowgladCustomer(options, orgSession)
            } catch (error) {
              // Best-effort: do not fail the organization creation process
              await reportCustomerCreateError(options, {
                hook: 'afterOrganizationCreate',
                customerType,
                session: orgSession,
                error,
              })
            }
          }),
        },
      ],
    },
  } satisfies FlowgladPlugin

  return plugin
}
