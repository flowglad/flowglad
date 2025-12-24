'use client'

import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

export function NavStandalone({
  items,
  title,
  indented = false,
}: {
  items: {
    title: string
    url: string
    icon?: LucideIcon | React.ComponentType<any>
    isActive?: boolean
  }[]
  title?: string
  /**
   * When true, applies left padding to each button
   * for sub-navigation visual hierarchy
   */
  indented?: boolean
}) {
  return (
    <SidebarGroup>
      {title && <SidebarGroupLabel>{title}</SidebarGroupLabel>}
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              asChild
              tooltip={item.title}
              isActive={item.isActive}
              className={cn(indented && 'pl-5')}
            >
              <Link href={item.url} prefetch={true}>
                {item.icon && <item.icon />}
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
