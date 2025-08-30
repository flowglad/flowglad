import * as trpcNext from '@trpc/server/adapters/next'
import { ApiEnvironment } from '@/types'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectFocusedMembershipAndOrganization,
  selectMembershipAndOrganizationsByBetterAuthUserId,
} from '@/db/tableMethods/membershipMethods'
import { Organization } from '@/db/schema/organizations'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { getSession } from '@/utils/auth'
import { UserRecord } from '@/db/schema/users'
import { selectUsers } from '@/db/tableMethods/userMethods'

export const createContext = async (
  opts: trpcNext.CreateNextContextOptions
) => {
  const session = await getSession()
  const betterAuthUserId = session?.user?.id
  let environment: ApiEnvironment = 'live'
  let organizationId: string | undefined
  let organization: Organization.Record | undefined
  let user: UserRecord | undefined

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
