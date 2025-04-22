'use client'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '@/components/ion/Navigation'
import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'

interface StandaloneNavigationItemProps {
  title: string
  href: string
  icon: ReactNode
  basePath: string
}

const StandaloneNavigationItem = ({
  title,
  href,
  icon,
  basePath,
}: StandaloneNavigationItemProps) => {
  const pathname = usePathname()

  return (
    <NavigationMenu>
      <NavigationMenuList className="w-full flex flex-col">
        <NavigationMenuItem>
          <NavigationMenuLink
            iconLeading={icon}
            className="w-full"
            href={href}
            selected={pathname.startsWith(basePath)}
          >
            {title}
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}

export default StandaloneNavigationItem