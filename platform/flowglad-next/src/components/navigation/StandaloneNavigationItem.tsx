'use client'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '@/components/ion/Navigation'
import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'
import { cn } from '@/utils/core'

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

  return (
    <NavigationMenu>
      <NavigationMenuList className="w-full flex flex-col">
        <NavigationMenuItem className="w-full">
          <NavigationMenuLink
            iconLeading={icon}
            className={cn(
              'w-full flex items-center transition-all duration-300 ease-in-out',
              isCollapsed
                ? 'justify-center px-2 gap-0'
                : 'justify-start px-3 gap-3'
            )}
            href={href}
            selected={pathname.startsWith(basePath)}
          >
            <span
              className={cn(
                'transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap',
                isCollapsed
                  ? 'max-w-0 opacity-0 ml-0'
                  : 'max-w-xs opacity-100 ml-2'
              )}
            >
              {isCollapsed ? null : title}
            </span>
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}

export default StandaloneNavigationItem
