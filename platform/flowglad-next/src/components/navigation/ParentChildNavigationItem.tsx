'use client'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '@/components/ion/Navigation'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { cn } from '@/utils/core'

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
  const [isOpen, setIsOpen] = useState(pathname.startsWith(basePath))
  return (
    <NavigationMenuItem className="w-full min-w-8">
      <NavigationMenuLink
        iconLeading={parentLeadingIcon}
        iconTrailing={
          isCollapsed ? null : isOpen ? (
            <ChevronUp size={16} strokeWidth={2} />
          ) : (
            <ChevronDown size={16} strokeWidth={2} />
          )
        }
        className={cn(
          'w-full flex items-center transition-all duration-300 ease-in-out',
          isCollapsed ? 'justify-center px-2' : ''
        )}
        onClick={() => {
          onClickParent?.()
          setIsOpen(!isOpen)
        }}
      >
        <span
          className={cn(
            'transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap',
            isCollapsed
              ? 'max-w-0 opacity-0 ml-0'
              : 'max-w-xs opacity-100 ml-2'
          )}
        >
          {isCollapsed ? null : parentLabel}
        </span>
      </NavigationMenuLink>
      {isOpen && !isCollapsed && (
        <NavigationMenu>
          <NavigationMenuList className="w-full flex flex-col pl-5 relative">
            {childItems.length > 1 && !isCollapsed && (
              <div
                className="absolute top-0 bottom-0 flex pl-5"
                style={{ left: '0px' }}
              >
                <div
                  className="w-px bg-stroke-subtle"
                  style={{
                    marginTop: '1rem',
                    marginBottom: '1rem',
                  }}
                />
              </div>
            )}
            {childItems.map((child) => (
              <NavigationMenuItem
                key={child.href}
                className={cn(
                  'transition-opacity duration-300',
                  isCollapsed ? 'opacity-0' : 'opacity-100 pl-4'
                )}
              >
                <NavigationMenuLink
                  className="w-full"
                  isChild
                  href={child.href}
                  selected={pathname.startsWith(child.href)}
                >
                  {child.label}
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>
      )}
    </NavigationMenuItem>
  )
}

export default ParentChildNavigationItem
