'use client'

import { SideNavigation } from '@/components/navigation/SideNavigation'
import React, { useState, useEffect } from 'react'
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

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

  // Prevent hydration mismatch by not rendering until initialized
  if (!isInitialized) {
    return null
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
