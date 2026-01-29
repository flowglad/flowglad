import * as Sentry from '@sentry/nextjs'
import type * as trpcNext from '@trpc/server/adapters/next'
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

/**
 * Get a header value from the request.
 * Handles both Node.js IncomingMessage and Fetch API Request objects.
 */
function getHeader(
  req: trpcNext.CreateNextContextOptions['req'],
  name: string
): string | null {
  const headers = req.headers as
    | Record<string, string | string[] | undefined>
    | Headers

  // Check if it's a Fetch API Headers object (has get method)
  if (headers && typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name)
  }

  // Node.js IncomingHttpHeaders - record-style access
  const value = (
    headers as Record<string, string | string[] | undefined>
  )?.[name]
  if (value) {
    return Array.isArray(value) ? value[0] : value
  }

  return null
}

/**
 * Extract IP address from request headers.
 * Checks common headers used by reverse proxies and CDNs.
 */
function getClientIp(
  req: trpcNext.CreateNextContextOptions['req']
): string {
  // Check common headers in order of preference
  const forwardedFor = getHeader(req, 'x-forwarded-for')
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs; take the first one
    const ips = forwardedFor.split(',')
    return ips[0].trim()
  }

  const realIp = getHeader(req, 'x-real-ip')
  if (realIp) {
    return realIp.trim()
  }

  // Fallback to unknown
  return 'unknown'
}

/**
 * Extract user agent from request headers.
 */
function getUserAgent(
  req: trpcNext.CreateNextContextOptions['req']
): string {
  const userAgent = getHeader(req, 'user-agent')
  if (userAgent) {
    return userAgent
  }

  return 'unknown'
}

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

  // Extract client IP and user agent for rate limiting
  const clientIp = getClientIp(opts.req)
  const userAgent = getUserAgent(opts.req)

  return {
    user,
    path: opts.req.url,
    environment,
    livemode: environment === 'live',
    organizationId,
    organization,
    isApi: false,
    apiKey: undefined,
    clientIp,
    userAgent,
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

    // Extract client IP and user agent for rate limiting
    const clientIp = getClientIp(opts.req)
    const userAgent = getUserAgent(opts.req)

    return {
      apiKey,
      isApi: true,
      path: opts.req.url,
      organizationId,
      organization,
      environment,
      livemode: environment === 'live',
      clientIp,
      userAgent,
    }
  }
}

export type TRPCContext = Awaited<ReturnType<typeof createContext>>

export type TRPCApiContext = Awaited<
  ReturnType<ReturnType<typeof createApiContext>>
>
