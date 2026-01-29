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
import { getSession } from '@/utils/auth'

export const createContext = async (
  opts: trpcNext.CreateNextContextOptions
) => {
  const session = await getSession()
  const betterAuthUserId = session?.user?.id
  let environment: ApiEnvironment = 'live'
  let organizationId: string | undefined
  let organization: Organization.Record | undefined
  let user: User.Record | undefined

  // Check if this is a customer billing portal session with contextOrganizationId
  // If so, prioritize that over the focused membership organization
  const contextOrganizationId = session?.session
    ?.contextOrganizationId as string | undefined

  if (betterAuthUserId) {
    // If contextOrganizationId is set, use it for customer billing portal context
    if (contextOrganizationId) {
      const [maybeUser, maybeOrganization] = await adminTransaction(
        async ({ transaction }) => {
          const users = await selectUsers(
            { betterAuthId: betterAuthUserId },
            transaction
          )
          const org = await selectOrganizationById(
            contextOrganizationId,
            transaction
          )
          return [users[0], org]
        }
      )
      if (maybeUser && maybeOrganization) {
        user = maybeUser
        organization = maybeOrganization
        organizationId = contextOrganizationId
        environment = 'live' // Customer billing portal is always live mode
      }
    } else {
      // Fall back to focused membership for merchant context
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

export type TRPCApiContext = Awaited<
  ReturnType<ReturnType<typeof createApiContext>>
>
