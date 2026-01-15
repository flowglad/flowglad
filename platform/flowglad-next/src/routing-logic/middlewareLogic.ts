type MiddlewareLogicResponse =
  | {
      proceed: true
      clearBillingPortalCookie?: boolean
    }
  | {
      proceed: false
      redirect: {
        url: string
        status: number
      }
    }

interface MiddlewareLogicParams {
  sessionCookie: string | null | undefined
  isProtectedRoute: boolean
  pathName: string
  customerBillingPortalOrganizationId: string | null | undefined
  req: {
    nextUrl: string
  }
}

export const middlewareLogic = (
  params: MiddlewareLogicParams
): MiddlewareLogicResponse => {
  const {
    sessionCookie,
    isProtectedRoute,
    pathName,
    customerBillingPortalOrganizationId,
  } = params
  if (!sessionCookie && isProtectedRoute) {
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

    return {
      proceed: false,
      redirect: {
        url: '/sign-in',
        status: 307,
      },
    }
  }

  // If user has a valid session, is accessing a non-billing-portal protected route,
  // and has a billing portal cookie set, we should clear the cookie
  // This fixes the issue where users get "stuck" in the billing portal
  if (
    sessionCookie &&
    customerBillingPortalOrganizationId &&
    isProtectedRoute &&
    !pathName.startsWith('/billing-portal/') &&
    !pathName.startsWith('/api/trpc/customerBillingPortal.')
  ) {
    return {
      proceed: true,
      clearBillingPortalCookie: true,
    }
  }

  // Legacy behavior: redirect unauthenticated users with billing portal cookie
  // This case handles when user is NOT logged in but has the cookie
  if (
    customerBillingPortalOrganizationId &&
    !pathName.startsWith(
      `/billing-portal/${customerBillingPortalOrganizationId}`
    ) &&
    isProtectedRoute &&
    !pathName.startsWith('/api/trpc/customerBillingPortal.')
  ) {
    return {
      proceed: false,
      redirect: {
        url: `/billing-portal/${customerBillingPortalOrganizationId}`,
        status: 307,
      },
    }
  }
  return { proceed: true }
}

