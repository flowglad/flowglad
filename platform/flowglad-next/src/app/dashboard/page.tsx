// Generated with Ion on 10/31/2024, 6:10:56 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=1033:8693
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
          organizationCreatedAt={organization.createdAt}
        />
      )}
    </ClientAuthGuard>
  )
}
