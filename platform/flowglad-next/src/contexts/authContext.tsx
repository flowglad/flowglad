'use client'
import type { Organization } from '@db-core/schema/organizations'
import type { User } from '@db-core/schema/users'
import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect, useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import {
  useCustomerSession,
  useMerchantSession,
} from '@/utils/authClient'

export type AuthContextValues = Partial<{
  user: User.Record
  role: 'merchant' | 'customer'
  organization: Organization.ClientRecord
}> & {
  authenticated: boolean
  authenticatedLoading: boolean
  setOrganization: (organization: Organization.ClientRecord) => void
  livemode: boolean
}

const AuthContext = createContext<AuthContextValues>({
  setOrganization: () => {},
  livemode: false,
  authenticatedLoading: false,
  authenticated: false,
})

/**
 * - user: User
 * - organization: Organization.ClientRecord | undefined
 */
export const useAuthContext = () => useContext(AuthContext)

export const useAuthenticatedContext = () => {
  const { organization, user, setOrganization, livemode } =
    useAuthContext()
  const session = useMerchantSession()
  if (!organization || !user || session.isPending) {
    return {
      authenticatedLoading: session.isPending,
      authenticated: false,
      ready: false,
    }
  }
  if (!setOrganization) {
    throw Error(
      'useAuthenticatedContext: setOrganization is not defined'
    )
  }
  const authenticated = session.data?.user?.id !== undefined
  return {
    user,
    organization,
    setOrganization,
    livemode,
    authenticated,
    authenticatedLoading: session.isPending,
    ready: true,
  }
}

const AuthProvider = ({
  children,
  values,
}: {
  children: React.ReactNode
  values: Omit<
    AuthContextValues,
    'setOrganization' | 'authenticatedLoading'
  >
}) => {
  const { user } = values
  const [organization, setOrganization] = useState<
    Organization.ClientRecord | undefined
  >(values.organization)
  const pathname = usePathname()

  // Determine if this is a billing portal route
  const isBillingPortal = pathname?.startsWith('/billing-portal')

  // Use the appropriate session hook based on route type
  const merchantSession = useMerchantSession()
  const customerSession = useCustomerSession()

  // Select the appropriate session based on route
  const session = isBillingPortal ? customerSession : merchantSession
  const authenticated = session.data?.user?.id !== undefined

  // Don't call getFocusedMembership during onboarding or on billing portal routes
  const isOnboarding = pathname?.startsWith('/onboarding')
  const shouldFetchMembership =
    values.role === 'merchant' &&
    authenticated &&
    !isOnboarding &&
    !isBillingPortal

  const {
    data: focusedMembership,
    refetch: refetchFocusedMembership,
  } = trpc.organizations.getFocusedMembership.useQuery(undefined, {
    enabled: shouldFetchMembership,
  })
  /**
   * A race condition happens where sometimes the layout renders
   * before the user is fetched when first logging in.
   * This gracefully recovers by refetching the focused membership
   * when the user is fetched.
   *
   * Note: We also check shouldFetchMembership because refetch() executes
   * regardless of the query's `enabled` state.
   */
  useEffect(() => {
    if (user && shouldFetchMembership) {
      refetchFocusedMembership()
    }
  }, [user, shouldFetchMembership, refetchFocusedMembership])

  const focusedOrganization = focusedMembership?.organization
  useEffect(() => {
    if (focusedOrganization) {
      setOrganization(focusedOrganization)
    }
  }, [focusedOrganization])
  return (
    <AuthContext.Provider
      value={{
        ...values,
        authenticatedLoading: session.isPending,
        user,
        authenticated,
        organization,
        setOrganization,
        livemode: focusedMembership?.membership.livemode ?? false,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export default AuthProvider
