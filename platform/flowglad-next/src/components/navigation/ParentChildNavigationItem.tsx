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

type NavigationChild = {
  label: string
  href: string
}

type ParentChildNavigationItemProps = {
  parentLabel: string
  parentLeadingIcon: ReactNode
  childItems: NavigationChild[]
  basePath: string
}

const ParentChildNavigationItem = ({
  parentLabel,
  parentLeadingIcon,
  childItems,
  basePath,
}: ParentChildNavigationItemProps) => {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(pathname.startsWith(basePath))
  return (
    <NavigationMenuItem>
      <NavigationMenuLink
        iconLeading={parentLeadingIcon}
        iconTrailing={
          isOpen ? (
            <ChevronUp size={16} strokeWidth={2} />
          ) : (
            <ChevronDown size={16} strokeWidth={2} />
          )
        }
        className="w-full"
        onClick={() => setIsOpen(!isOpen)}
      >
        {parentLabel}
      </NavigationMenuLink>
      {isOpen && (
        <NavigationMenu>
          <NavigationMenuList className="w-full flex flex-col pl-5 relative">
            {childItems.length > 1 && (
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
              <NavigationMenuItem key={child.href} className="pl-4">
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
