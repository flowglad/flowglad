type MiddlewareLogicResponse =
  | {
      proceed: true
    }
  | {
      proceed: false
      redirect: {
        url: string
        status: number
      }
    }

interface MiddlewareLogicParams {
  merchantSessionCookie: string | null | undefined
  customerSessionCookie: string | null | undefined
  isProtectedRoute: boolean
  pathName: string
  req: {
    nextUrl: string
  }
}

/**
 * Determines whether a route is a billing portal route.
 * Billing portal routes are under /billing-portal/* or are customerBillingPortal TRPC routes.
 * Customer TRPC routes are served at both /api/trpc/customerBillingPortal.* (legacy)
 * and /api/trpc/customer/customerBillingPortal.* (new dual-scope endpoint).
 */
const isBillingPortalRoute = (pathName: string): boolean => {
  return (
    pathName.startsWith('/billing-portal/') ||
    pathName.startsWith('/api/trpc/customerBillingPortal.') ||
    pathName.startsWith('/api/trpc/customer/')
  )
}

export const middlewareLogic = (
  params: MiddlewareLogicParams
): MiddlewareLogicResponse => {
  const {
    merchantSessionCookie,
    customerSessionCookie,
    isProtectedRoute,
    pathName,
  } = params

  // Determine which session to use based on route type
  const isBillingPortal = isBillingPortalRoute(pathName)
  const relevantSessionCookie = isBillingPortal
    ? customerSessionCookie
    : merchantSessionCookie

  if (!relevantSessionCookie && isProtectedRoute) {
    if (pathName.startsWith('/billing-portal/')) {
      const pathParts = pathName.split('/').filter(Boolean)
      // pathParts: ['billing-portal', 'org_xxx', 'cust_xxx', ...]
      const organizationId = pathParts[1]
      const customerId = pathParts[2]

      // Guard: If no organizationId, redirect to general sign-in
      // (this shouldn't happen with valid Next.js routes but provides defensive handling)
      if (!organizationId) {
        return {
          proceed: false,
          redirect: {
            url: '/sign-in',
            status: 307,
          },
        }
      }

      // If path includes a customerId and it's not already a sign-in page, redirect to customer-specific sign-in
      if (customerId && !pathName.includes('/sign-in')) {
        return {
          proceed: false,
          redirect: {
            url: `/billing-portal/${organizationId}/${customerId}/sign-in`,
            status: 307,
          },
        }
      }

      // Otherwise redirect to organization-level sign-in
      return {
        proceed: false,
        redirect: {
          url: `/billing-portal/${organizationId}/sign-in`,
          status: 307,
        },
      }
    }

    // For merchant routes without a merchant session, redirect to sign-in
    return {
      proceed: false,
      redirect: {
        url: '/sign-in',
        status: 307,
      },
    }
  }

  // With dual sessions, we no longer need to redirect users based on customerBillingPortalOrganizationId.
  // Users with both sessions can access both route types without conflicts.

  return { proceed: true }
}
