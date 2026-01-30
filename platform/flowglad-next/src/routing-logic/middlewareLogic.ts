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

export const middlewareLogic = (
  params: MiddlewareLogicParams
): MiddlewareLogicResponse => {
  const {
    merchantSessionCookie,
    customerSessionCookie,
    isProtectedRoute,
    pathName,
  } = params

  // Determine which session to check based on the route
  const isBillingPortalRoute = pathName.startsWith('/billing-portal/')
  const relevantSessionCookie = isBillingPortalRoute
    ? customerSessionCookie
    : merchantSessionCookie

  if (!relevantSessionCookie && isProtectedRoute) {
    if (isBillingPortalRoute) {
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

    return {
      proceed: false,
      redirect: {
        url: '/sign-in',
        status: 307,
      },
    }
  }

  return { proceed: true }
}
