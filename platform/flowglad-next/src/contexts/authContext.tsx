'use client'
import type { Organization } from '@db-core/schema/organizations'
import type { User } from '@db-core/schema/users'
import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect, useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import { useSession } from '@/utils/authClient'

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
  const session = useSession()
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
  const session = useSession()
  const pathname = usePathname()
  const authenticated = session.data?.user?.id !== undefined
  // Don't call getFocusedMembership during onboarding - user has no membership yet
  const isOnboarding = pathname?.startsWith('/onboarding')
  const {
    data: focusedMembership,
    refetch: refetchFocusedMembership,
  } = trpc.organizations.getFocusedMembership.useQuery(undefined, {
    enabled:
      values.role === 'merchant' && authenticated && !isOnboarding,
  })
  /**
   * A race condition happens where sometimes the layout renders
   * before the user is fetched when first logging in.
   * This gracefully recovers by refetching the focused membership
   * when the user is fetched.
   *
   * Note: We also check !isOnboarding because refetch() executes
   * regardless of the query's `enabled` state.
   */
  useEffect(() => {
    if (user && !isOnboarding) {
      refetchFocusedMembership()
    }
  }, [user, isOnboarding, refetchFocusedMembership])

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
