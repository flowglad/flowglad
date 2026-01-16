'use client'

import { Suspense } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { DemoAppSidebar } from './DemoAppSidebar'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from './demo-sidebar'

// CSS variable values for the demo layout
const SIDEBAR_WIDTH = '16rem'
const SIDEBAR_WIDTH_ICON = '3rem'

const DemoLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <SidebarProvider
      defaultOpen={true}
      style={
        {
          '--sidebar-width': SIDEBAR_WIDTH,
          '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
        } as React.CSSProperties
      }
    >
      <Suspense
        fallback={
          <div className="flex h-screen w-[--sidebar-width] items-center justify-center border-r">
            <span className="text-sm text-muted-foreground">
              Loading...
            </span>
          </div>
        }
      >
        <DemoAppSidebar className="z-20" />
      </Suspense>
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/demo-route">
                    Demo Tools
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Email Previews</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default DemoLayout
