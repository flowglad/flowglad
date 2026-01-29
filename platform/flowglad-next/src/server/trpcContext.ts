import type { Organization } from '@db-core/schema/organizations'
import type { User } from '@db-core/schema/users'
import * as Sentry from '@sentry/nextjs'
import type * as trpcNext from '@trpc/server/adapters/next'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectFocusedMembershipAndOrganization,
  selectMembershipAndOrganizationsByBetterAuthUserId,
} from '@/db/tableMethods/membershipMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectUsers } from '@/db/tableMethods/userMethods'
import type { ApiEnvironment } from '@/types'
import {
  getSession,
  getMerchantSession,
  getCustomerSession,
} from '@/utils/auth'

export const createContext = async (
  opts: trpcNext.CreateNextContextOptions
) => {
  // Use merchant session for default context
  const session = await getMerchantSession()
  const betterAuthUserId = session?.user?.id
  let environment: ApiEnvironment = 'live'
  let organizationId: string | undefined
  let organization: Organization.Record | undefined
  let user: User.Record | undefined

  if (betterAuthUserId) {
    const memberships = await adminTransaction(
      async ({ transaction }) => {
        return selectMembershipAndOrganizationsByBetterAuthUserId(
          betterAuthUserId,
          transaction
        )
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
    } else {
      const [maybeUser] = await adminTransaction(
        async ({ transaction }) => {
          return selectUsers(
            { betterAuthId: betterAuthUserId },
            transaction
          )
        }
      )
      if (maybeUser) {
        user = maybeUser
      }
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
 * Creates customer context for customer billing portal operations.
 * Uses customer session and extracts organizationId from session.contextOrganizationId.
 */
export const createCustomerContext = async (
  opts: trpcNext.CreateNextContextOptions
) => {
  const session = await getCustomerSession()
  const betterAuthUserId = session?.user?.id
  const isCustomerSession = !!session?.session?.contextOrganizationId

  if (!betterAuthUserId || !isCustomerSession) {
    return {
      user: undefined,
      session: undefined,
      path: opts.req.url,
      isApi: false,
      apiKey: undefined,
      authScope: 'customer' as const,
      organizationId: undefined,
      organization: undefined,
      livemode: true,
      environment: 'live' as const,
    }
  }

  // Get organizationId from customer session's contextOrganizationId
  const organizationId = session.session?.contextOrganizationId

  let organization: Organization.Record | undefined
  let user: User.Record | undefined

  if (organizationId) {
    // Load organization and user
    const result = await adminTransaction(async ({ transaction }) => {
      const org = await selectOrganizationById(organizationId, transaction)
      const [appUser] = await selectUsers(
        { betterAuthId: betterAuthUserId },
        transaction
      )
      return { org, appUser }
    })

    organization = result.org
    user = result.appUser
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
    organizationId,
    organization,
    environment: 'live' as const,
    livemode: true,
    path: opts.req.url,
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
