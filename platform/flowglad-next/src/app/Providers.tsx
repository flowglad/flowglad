'use client'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import type { AuthContextValues } from '../contexts/authContext'
import AuthProvider from '../contexts/authContext'
import TrpcProvider from '@/app/_trpc/Provider'
import PostHogPageView from './PostHogPageview'
if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: false, // Disable automatic pageview capture, as we capture manually
  })
}

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"

export default function Providers({
  children,
  authContext,
  defaultSidebarOpen = true,
}: {
  children: React.ReactNode
  authContext: Omit<AuthContextValues, 'setOrganization'>
  defaultSidebarOpen?: boolean
}) {
  return (
    <TrpcProvider>
      <AuthProvider values={authContext}>
        <PostHogProvider client={posthog}>
          <PostHogPageView user={authContext.user} />
          <SidebarProvider defaultOpen={defaultSidebarOpen}>
            <AppSidebar />
            <main className="flex-1">
              <SidebarTrigger className="md:hidden fixed top-2 left-2 z-50" />
              {children}
            </main>
          </SidebarProvider>
        </PostHogProvider>
      </AuthProvider>
    </TrpcProvider>
  )
}
