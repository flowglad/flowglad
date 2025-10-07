'use client'

import InternalDashboard from './InternalDashboard'
import {
  ClientAuthGuard,
  DashboardLoadingFallback,
} from '@/components/ClientAuthGuard'
import { useAuthContext } from '@/contexts/authContext'

export default function Home() {
  const { organization } = useAuthContext()

  return (
    <ClientAuthGuard
      requireAuth={true}
      requireOrganization={true}
      fallbackComponent={<DashboardLoadingFallback />}
    >
      {organization && (
        <InternalDashboard
          organizationCreatedAt={new Date(organization.createdAt)}
        />
      )}
    </ClientAuthGuard>
  )
}
