'use client'

import { ChevronRight, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React from 'react'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'

export function NavMain({
  items,
  title,
}: {
  items: {
    title: string
    url: string
    icon?: LucideIcon
    isActive?: boolean
    items?: {
      title: string
      url: string
    }[]
  }[]
  title?: string
}) {
  const pathname = usePathname()
  const { state, setOpen } = useSidebar()
  const isCollapsed = state === 'collapsed'

  // State to track which items are expanded
  const [expandedItems, setExpandedItems] = React.useState<
    Set<string>
  >(new Set())

  // Helper function to check if a URL is active
  const isActiveUrl = (url: string) => {
    return pathname === url || pathname.startsWith(url + '/')
  }

  // Initialize expanded state based on active items
  React.useEffect(() => {
    const initialExpanded = new Set<string>()
    items.forEach((item) => {
      const hasActiveSubItem =
        item.items?.some((subItem) => isActiveUrl(subItem.url)) ||
        false
      const shouldBeOpen = item.isActive || hasActiveSubItem
      if (shouldBeOpen) {
        initialExpanded.add(item.title)
      }
    })
    setExpandedItems(initialExpanded)
    // FIXME(FG-384): Fix this warning:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, pathname])

  return (
    <SidebarGroup>
      {title && <SidebarGroupLabel>{title}</SidebarGroupLabel>}
      <SidebarMenu>
        {items.map((item) => {
          const isItemExpanded = expandedItems.has(item.title)

          // Handle click on collapsed sidebar with children
          const handleParentClick = (event: React.MouseEvent) => {
            if (isCollapsed && item.items && item.items.length > 0) {
              event.preventDefault()
              // Open the sidebar first, then expand the item
              setOpen(true)
              // Add the item to expanded items so it opens when sidebar expands
              setExpandedItems((prev) =>
                new Set(prev).add(item.title)
              )
            }
          }

          // Handle collapsible state changes
          const handleOpenChange = (open: boolean) => {
            setExpandedItems((prev) => {
              const newSet = new Set(prev)
              if (open) {
                newSet.add(item.title)
              } else {
                newSet.delete(item.title)
              }
              return newSet
            })
          }

          return (
            <Collapsible
              key={item.title}
              asChild
              open={isItemExpanded}
              onOpenChange={handleOpenChange}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton
                    tooltip={item.title}
                    onClick={handleParentClick}
                  >
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    {item.items && (
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    )}
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                {item.items && (
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items.map((subItem) => {
                        const isSubItemActive = isActiveUrl(
                          subItem.url
                        )
                        return (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isSubItemActive}
                            >
                              <Link
                                href={subItem.url}
                                prefetch={true}
                              >
                                <span>{subItem.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                )}
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
