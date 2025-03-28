import * as trpcNext from '@trpc/server/adapters/next'
import { ApiEnvironment } from '@/types'
import { adminTransaction } from '@/db/databaseMethods'
import { selectFocusedMembershipAndOrganization } from '@/db/tableMethods/membershipMethods'
import { stackServerApp } from '@/stack'
import { Organization } from '@/db/schema/organizations'

export const createContext = async (
  opts: trpcNext.CreateNextContextOptions
) => {
  const user = await stackServerApp.getUser()
  let environment: ApiEnvironment = 'live'
  let organizationId: string | undefined
  let organization: Organization.Record | undefined
  if (user) {
    const maybeMembership = await adminTransaction(
      async ({ transaction }) => {
        return selectFocusedMembershipAndOrganization(
          user.id,
          transaction
        )
      }
    )
    if (maybeMembership) {
      const { membership } = maybeMembership
      environment = membership.livemode ? 'live' : 'test'
      organization = maybeMembership.organization
      organizationId = organization.id
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
    return {
      apiKey,
      isApi: true,
      path: opts.req.url,
      organizationId,
      environment,
      livemode: environment === 'live',
    }
  }
}

export type TRPCContext = Awaited<ReturnType<typeof createContext>>

export type TRPCApiContext = Awaited<
  ReturnType<ReturnType<typeof createApiContext>>
>
