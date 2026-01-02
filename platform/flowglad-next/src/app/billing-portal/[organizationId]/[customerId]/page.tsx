import InternalBillingPortalPage from './Internal'

// Session check is handled by middleware (middlewareLogic.ts)
// which redirects unauthenticated users to the sign-in page
export default function BillingPortalPage() {
  return <InternalBillingPortalPage />
}
