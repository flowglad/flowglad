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
import { getMerchantSession, getCustomerSession } from '@/utils/auth'

/**
 * Create context for merchant requests (default TRPC context).
 * Uses merchant session and validates scope.
 */
export const createContext = async (
  opts: trpcNext.CreateNextContextOptions
) => {
  const session = await getMerchantSession()
  const isMerchantSession = session?.session?.scope === 'merchant' || !session?.session?.scope

  // If session exists but is not merchant scope, treat as unauthenticated
  if (session && session.session?.scope && !isMerchantSession) {
    return {
      user: undefined,
      organizationId: undefined,
      organization: undefined,
      environment: 'live' as const,
      livemode: true,
      path: opts.req.url,
      isApi: false,
      apiKey: undefined,
      authScope: 'merchant' as const,
      session: undefined,
    }
  }

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
    path: opts.req.url,
    environment,
    livemode: environment === 'live',
    organizationId,
    organization,
    isApi: false,
    apiKey: undefined,
    authScope: 'merchant' as const,
    session,
  }
}

/**
 * Create context for customer billing portal requests.
 * Uses customer session and validates scope.
 */
export const createCustomerContext = async (
  opts: trpcNext.CreateNextContextOptions
) => {
  const session = await getCustomerSession()
  const isCustomerSession = session?.session?.scope === 'customer'

  if (!session?.user || !isCustomerSession) {
    return {
      user: undefined,
      path: opts.req.url,
      isApi: false,
      apiKey: undefined,
      authScope: 'customer' as const,
      organizationId: undefined,
      livemode: true,
      environment: 'live' as const,
      session: undefined,
      organization: undefined,
    }
  }

  // Get organizationId from session's contextOrganizationId
  const organizationId = session.session?.contextOrganizationId

  let user: User.Record | undefined
  let organization: Organization.Record | undefined

  const betterAuthUserId = session?.user?.id

  if (betterAuthUserId) {
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

  if (organizationId) {
    const result = await adminTransaction(
      async ({ transaction }) => {
        return selectOrganizationById(organizationId, transaction)
      }
    )
    if (result.ok) {
      organization = result.value
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
    organizationId,
    organization,
    environment: 'live' as const,
    livemode: true,
    path: opts.req.url,
    isApi: false,
    apiKey: undefined,
    authScope: 'customer' as const,
    session,
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

export type TRPCCustomerContext = Awaited<ReturnType<typeof createCustomerContext>>

export type TRPCApiContext = Awaited<
  ReturnType<ReturnType<typeof createApiContext>>
>
