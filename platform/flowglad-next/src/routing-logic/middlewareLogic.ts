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
    console.log(
      'sessionCookie is not set and isProtectedRoute is true'
    )
    if (pathName.startsWith('/billing-portal/')) {
      console.log(
        'redirecting to billing portal sign-in because sessionCookie is not set and pathName starts with /billing-portal/${customerBillingPortalOrganizationId}'
      )

      const organizationId = pathName.split('/')[2]
      return {
        proceed: false,
        redirect: {
          url: `/billing-portal/${organizationId}/sign-in`,
          status: 307,
        },
      }
    }
    console.log(
      'redirecting to sign-in because sessionCookie is not set and pathName does not start with /billing-portal/${customerBillingPortalOrganizationId}'
    )

    return {
      proceed: false,
      redirect: {
        url: '/sign-in',
        status: 307,
      },
    }
  }

  if (
    customerBillingPortalOrganizationId &&
    !pathName.startsWith(
      `/billing-portal/${customerBillingPortalOrganizationId}`
    ) &&
    isProtectedRoute &&
    !pathName.startsWith('/api/trpc/customerBillingPortal.')
  ) {
    console.log(
      'redirecting to billing portal because customerBillingPortalOrganizationId is set and pathName does not start with /billing-portal/${customerBillingPortalOrganizationId}'
    )
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
