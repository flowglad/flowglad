'use client'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import type { AuthContextValues } from '../contexts/authContext'
import AuthProvider from '../contexts/authContext'
import TrpcProvider from '@/app/_trpc/Provider'
import PostHogPageView from './PostHogPageview'
import FeaturebaseMessenger from './FeaturebaseMessenger'
import { usePathname } from 'next/navigation'
if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: false, // Disable automatic pageview capture, as we capture manually
  })
}

export default function Providers({
  children,
  authContext,
  isPublicRoute,
}: {
  children: React.ReactNode
  authContext: Omit<AuthContextValues, 'setOrganization'>
  isPublicRoute?: boolean
}) {
  const pathname = usePathname()
  const isBillingPortal = Boolean(pathname?.startsWith('/billing-portal'))
  return (
    <TrpcProvider>
      <AuthProvider values={authContext}>
        <PostHogProvider client={posthog}>
          <PostHogPageView user={authContext.user} />
          {!isPublicRoute && !isBillingPortal && <FeaturebaseMessenger />}
          {children}
        </PostHogProvider>
      </AuthProvider>
    </TrpcProvider>
  )
}
