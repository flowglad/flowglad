'use client'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { cn } from '@/utils/core'
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'
import Link from 'next/link'

type NavigationChild = {
  label: string
  href: string
}

type ParentChildNavigationItemProps = {
  parentLabel: string
  parentLeadingIcon: ReactNode
  childItems: NavigationChild[]
  basePath: string
  isCollapsed: boolean
  onClickParent?: () => void
}

const ParentChildNavigationItem = ({
  parentLabel,
  parentLeadingIcon,
  childItems,
  basePath,
  isCollapsed,
  onClickParent,
}: ParentChildNavigationItemProps) => {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(
    pathname === basePath || pathname.startsWith(basePath + '/')
  )
  const { setOpen } = useSidebar()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => {
          onClickParent?.()
          if (isCollapsed) {
            setOpen(true)
            setIsOpen(true)
          } else {
            setIsOpen((prev) => !prev)
          }
        }}
        tooltip={parentLabel}
        className={cn(
          'w-full flex items-center',
          isCollapsed ? 'justify-center gap-0' : 'gap-2'
        )}
      >
        <span
          className={cn(
            'w-full h-full flex items-center',
            isCollapsed ? 'gap-0' : 'gap-2'
          )}
        >
          {parentLeadingIcon}
          <span
            className={cn(
              'transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap',
              isCollapsed
                ? 'max-w-0 opacity-0 ml-0'
                : 'max-w-xs opacity-100'
            )}
          >
            {isCollapsed ? null : parentLabel}
          </span>
          {!isCollapsed && (
            <span className="ml-auto shrink-0">
              {isOpen ? (
                <ChevronUp size={16} strokeWidth={2} />
              ) : (
                <ChevronDown size={16} strokeWidth={2} />
              )}
            </span>
          )}
        </span>
      </SidebarMenuButton>
      {isOpen && !isCollapsed && (
        <SidebarMenuSub className="pl-5">
          {childItems.map((child) => {
            const childActive =
              pathname === child.href ||
              pathname.startsWith(child.href + '/')
            return (
              <SidebarMenuSubItem key={child.href}>
                <SidebarMenuSubButton asChild isActive={childActive}>
                  <Link
                    href={child.href}
                    aria-current={childActive ? 'page' : undefined}
                    className="block w-full min-w-0"
                  >
                    <span className="truncate">{child.label}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )
          })}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  )
}

export default ParentChildNavigationItem
