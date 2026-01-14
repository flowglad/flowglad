'use client'

import type React from 'react'
import { useEffect, useState } from 'react'
import { SideNavigation } from '@/components/navigation/SideNavigation'
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

// CSS variable values matching sidebar.tsx for consistent layout
const SIDEBAR_WIDTH = '14rem'
const SIDEBAR_WIDTH_ICON = '3rem'
const LAYOUT_MAX_WIDTH = '60rem'

// Utility function to read cookie value on client side
const getCookieValue = (name: string): string | null => {
  if (typeof document === 'undefined') return null
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2)
    return parts.pop()?.split(';').shift() || null
  return null
}

const SidebarLayout = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [defaultOpen, setDefaultOpen] = useState(true)
  const [isInitialized, setIsInitialized] = useState(false)

  // Read the sidebar state from cookies on client side to persist across navigation
  useEffect(() => {
    const sidebarState = getCookieValue('sidebar_state')
    // Default to expanded for new users (when no cookie exists)
    // Only collapse if explicitly set to 'false'
    const shouldOpen = sidebarState !== 'false'
    setDefaultOpen(shouldOpen)
    setIsInitialized(true)
  }, [])

  // Render a skeleton layout during initialization to prevent layout shift.
  // This maintains the same CSS variables and structure as the full layout.
  if (!isInitialized) {
    return (
      <div
        style={
          {
            '--sidebar-width': SIDEBAR_WIDTH,
            '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
            '--layout-max-width': LAYOUT_MAX_WIDTH,
          } as React.CSSProperties
        }
        className="group/sidebar-wrapper flex min-h-screen w-full justify-center"
      >
        <div className="flex w-full max-w-[var(--layout-max-width)]">
          {/* Sidebar placeholder - matches expanded sidebar width on desktop */}
          <div className="hidden md:block relative w-[--sidebar-width] bg-transparent" />
          {/* Content area - matches SidebarInset structure */}
          <main className="relative flex flex-1 min-w-0 flex-col bg-background">
            {/* Mobile top bar placeholder */}
            <div className="md:hidden sticky top-0 z-30 flex items-center h-12 border-b bg-background px-2" />
            {children}
          </main>
        </div>
      </div>
    )
  }

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <Sidebar collapsible="icon" className="z-20">
        <SideNavigation />
      </Sidebar>
      <SidebarInset>
        {/* Mobile top bar with trigger */}
        <div className="md:hidden sticky top-0 z-30 flex items-center h-12 border-b bg-background px-2">
          <SidebarTrigger />
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}

export default SidebarLayout
