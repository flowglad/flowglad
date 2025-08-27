'use client'
import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'
import { cn } from '@/utils/core'
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import Link from 'next/link'

interface StandaloneNavigationItemProps {
  title: string
  href: string
  icon: ReactNode
  basePath: string
  isCollapsed: boolean
}

const StandaloneNavigationItem = ({
  title,
  href,
  icon,
  basePath,
  isCollapsed,
}: StandaloneNavigationItemProps) => {
  const pathname = usePathname()
  const isActive =
    pathname === basePath || pathname.startsWith(basePath + '/')

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={title}
        className={cn(
          'group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:justify-center'
        )}
      >
        <Link
          href={href}
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            'w-full h-full flex items-center min-w-0',
            isCollapsed ? 'gap-0' : 'gap-2'
          )}
        >
          {icon}
          <span
            className={cn(
              'transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap',
              isCollapsed
                ? 'max-w-0 opacity-0 ml-0'
                : 'max-w-xs opacity-100 truncate'
            )}
          >
            {isCollapsed ? null : title}
          </span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export default StandaloneNavigationItem
