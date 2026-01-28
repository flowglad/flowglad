import * as Sentry from '@sentry/nextjs'
import type * as trpcNext from '@trpc/server/adapters/next'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import type { Organization } from '@/db/schema/organizations'
import type { User } from '@/db/schema/users'
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

  if (betterAuthUserId) {
    const membershipsResult = await adminTransaction(
      async ({ transaction }) => {
        return Result.ok(
          await selectMembershipAndOrganizationsByBetterAuthUserId(
            betterAuthUserId,
            transaction
          )
        )
      }
    )
    const memberships = membershipsResult.unwrap()
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
      const usersResult = await adminTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await selectUsers(
              { betterAuthId: betterAuthUserId },
              transaction
            )
          )
        }
      )
      const [maybeUser] = usersResult.unwrap()
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
    const orgTxResult = await adminTransaction(
      async ({ transaction }) => {
        const orgResult = await selectOrganizationById(
          organizationId,
          transaction
        )
        return Result.ok(orgResult.unwrap())
      }
    )
    const organization = orgTxResult.unwrap()
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
