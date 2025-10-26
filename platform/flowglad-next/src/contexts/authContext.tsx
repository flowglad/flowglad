'use client'
import { Organization } from '@/db/schema/organizations'
import { createContext, useContext, useEffect, useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import { User } from '@/db/schema/users'
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
  const authenticated = session.data?.user?.id !== undefined
  const {
    data: focusedMembership,
    refetch: refetchFocusedMembership,
  } = trpc.organizations.getFocusedMembership.useQuery(undefined, {
    enabled: values.role === 'merchant' && authenticated,
  })
  /**
   * A race condition happens where sometimes the layout renders
   * before the user is fetched when first logging in.
   * This gracefully recovers by refetching the focused membership
   * when the user is fetched.
   */
  useEffect(() => {
    if (user) {
      refetchFocusedMembership()
    }
  }, [user, refetchFocusedMembership])

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
