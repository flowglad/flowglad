'use client'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import type { AuthContextValues } from '../contexts/authContext'
import AuthProvider from '../contexts/authContext'
import TrpcProvider from '@/app/_trpc/Provider'

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
}: {
  children: React.ReactNode
  authContext: Omit<AuthContextValues, 'setOrganization'>
}) {
  return (
    <TrpcProvider>
      <AuthProvider values={authContext}>
        <PostHogProvider client={posthog}>{children}</PostHogProvider>
      </AuthProvider>
    </TrpcProvider>
  )
}
