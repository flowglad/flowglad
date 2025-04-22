'use client'
import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  NavigationMenuItem,
  NavigationMenuLink,
} from '@/components/ion/Navigation'
import { useState } from 'react'
import { usePathname } from 'next/navigation'

interface ParentChildNavigationItemProps {
  parentLabel: string
  parentLeadingIcon?: React.ReactNode
  childItems: {
    label: string
    href: string
  }[]
  basePath: string
}

export default function ParentChildNavigationItem({
  parentLabel,
  parentLeadingIcon,
  childItems,
  basePath,
}: ParentChildNavigationItemProps) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()
  const isSelected = pathname.startsWith(basePath)

  return (
    <NavigationMenuItem>
      <NavigationMenuLink
        iconLeading={parentLeadingIcon}
        iconTrailing={isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        className="w-full"
        selected={isSelected}
        onClick={() => setIsOpen(!isOpen)}
      >
        {parentLabel}
      </NavigationMenuLink>
      {isOpen && (
        <div className="relative ml-7 mt-1 flex flex-col gap-1">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-0 h-full w-[1px] bg-stroke-subtle" />
          
          {childItems.map((item) => (
            <NavigationMenuLink
              key={item.href}
              href={item.href}
              selected={pathname === item.href}
              isChild
              className="relative pl-6"
            >
              {/* Dot */}
              <div className="absolute left-[3px] top-1/2 h-3 w-3 -translate-y-1/2">
                <div className={`h-[5px] w-[5px] rounded-full ${pathname === item.href ? 'bg-on-primary-container' : 'bg-subtle'}`} />
              </div>
              {item.label}
            </NavigationMenuLink>
          ))}
        </div>
      )}
    </NavigationMenuItem>
  )
}