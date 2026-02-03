import type { Organization } from '@db-core/schema/organizations'
import type { User } from '@db-core/schema/users'
import * as Sentry from '@sentry/nextjs'
import type * as trpcNext from '@trpc/server/adapters/next'
import { adminTransaction } from '@/db/adminTransaction'
import { selectMembershipAndOrganizationsByBetterAuthUserId } from '@/db/tableMethods/membershipMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectUsers } from '@/db/tableMethods/userMethods'
import type { ApiEnvironment } from '@/types'
import { getCustomerSession, getMerchantSession } from '@/utils/auth'

/**
 * Auth scope for TRPC context.
 * - 'merchant': Merchant dashboard context (default)
 * - 'customer': Customer billing portal context
 */
export type AuthScope = 'merchant' | 'customer'

/**
 * Creates the default TRPC context for merchant routes.
 * Uses merchant session from better-auth with scope='merchant'.
 */
export const createContext = async (
  opts: trpcNext.CreateNextContextOptions
) => {
  const session = await getMerchantSession()
  const betterAuthUserId = session?.user?.id

  // Verify session scope is 'merchant' (or undefined for backward compatibility)
  const sessionScope = (
    session?.session as { scope?: string } | undefined
  )?.scope
  const isMerchantSession =
    !sessionScope || sessionScope === 'merchant'

  let environment: ApiEnvironment = 'live'
  let organizationId: string | undefined
  let organization: Organization.Record | undefined
  let user: User.Record | undefined

  if (betterAuthUserId && isMerchantSession) {
    const { memberships, fallbackUser } = await adminTransaction(
      async ({ transaction }) => {
        const memberships =
          await selectMembershipAndOrganizationsByBetterAuthUserId(
            betterAuthUserId,
            transaction
          )
        // Only query user if no focused membership found
        const hasFocusedMembership = memberships.some(
          (m) => m.membership.focused
        )
        const fallbackUser = hasFocusedMembership
          ? undefined
          : (
              await selectUsers(
                { betterAuthId: betterAuthUserId },
                transaction
              )
            )[0]
        return { memberships, fallbackUser }
      }
    )

    const maybeMembership = memberships.find(
      (membership) => membership.membership.focused
    )
    if (maybeMembership) {
      const { membership } = maybeMembership
      environment = membership.livemode ? 'live' : 'test'
      organization = maybeMembership.organization
      organizationId = organization.id
      user = maybeMembership.user
    } else if (fallbackUser) {
      user = fallbackUser
    }
  }

  // Set user context in Sentry for error tracking
  if (user) {
    Sentry.setUser({
      id: user.id,
    })
  } else {
    Sentry.setUser(null)
  }
  return {
    user,
    session,
    path: opts.req.url,
    environment,
    livemode: environment === 'live',
    organizationId,
    organization,
    isApi: false,
    apiKey: undefined,
    authScope: 'merchant' as const,
  }
}

/**
 * Creates TRPC context for customer billing portal routes.
 * Uses customer session from better-auth with scope='customer'.
 * Organization context comes from session.contextOrganizationId.
 */
export const createCustomerContext = async (
  opts: trpcNext.CreateNextContextOptions
) => {
  const session = await getCustomerSession()
  const betterAuthUserId = session?.user?.id

  // Verify session scope is 'customer'
  const sessionScope = (
    session?.session as { scope?: string } | undefined
  )?.scope
  const isCustomerSession = sessionScope === 'customer'

  let user: User.Record | undefined
  let organization: Organization.Record | undefined
  let organizationId: string | undefined

  if (betterAuthUserId && isCustomerSession) {
    // Get organizationId from customer session's contextOrganizationId
    organizationId = (
      session?.session as
        | { contextOrganizationId?: string }
        | undefined
    )?.contextOrganizationId

    // Look up user and organization in a single transaction
    const { maybeUser, maybeOrganization } = await adminTransaction(
      async ({ transaction }) => {
        const [maybeUser] = await selectUsers(
          { betterAuthId: betterAuthUserId },
          transaction
        )

        // Only query organization if we have an organizationId
        let maybeOrganization: Organization.Record | undefined
        if (organizationId) {
          const orgResult = await selectOrganizationById(
            organizationId,
            transaction
          )
          if (orgResult.status === 'ok') {
            maybeOrganization = orgResult.value
          }
        }

        return { maybeUser, maybeOrganization }
      }
    )

    if (maybeUser) {
      user = maybeUser
    }
    if (maybeOrganization) {
      organization = maybeOrganization
    }
  }

  // Set user context in Sentry for error tracking
  if (user) {
    Sentry.setUser({
      id: user.id,
    })
  } else {
    Sentry.setUser(null)
  }

  return {
    user,
    session,
    path: opts.req.url,
    environment: 'live' as const,
    livemode: true,
    organizationId,
    organization,
    isApi: false,
    apiKey: undefined,
    authScope: 'customer' as const,
  }
}

export const createApiContext = ({
  organizationId,
  environment,
}: {
  organizationId: string
  environment: ApiEnvironment
}) => {
  return async (opts: trpcNext.CreateNextContextOptions) => {
    /**
     * Get the api key from the request headers
     */
    // @ts-expect-error - headers get
    const apiKey = opts.req.headers
      // @ts-expect-error - headers get
      .get('Authorization')
      ?.replace(/^Bearer\s/, '')
    const organization = await adminTransaction(
      async ({ transaction }) => {
        return selectOrganizationById(organizationId, transaction)
      }
    )
    return {
      apiKey,
      isApi: true,
      path: opts.req.url,
      organizationId,
      organization,
      environment,
      livemode: environment === 'live',
    }
  }
}

export type TRPCContext = Awaited<ReturnType<typeof createContext>>

export type TRPCCustomerContext = Awaited<
  ReturnType<typeof createCustomerContext>
>

export type TRPCApiContext = Awaited<
  ReturnType<ReturnType<typeof createApiContext>>
>
