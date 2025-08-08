import { SideNavigation } from '@/components/navigation/SideNavigation'
import React from 'react'
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

const SidebarLayout = ({
  children,
}: {
  children: React.ReactNode
}) => {
  return (
    <SidebarProvider>
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
