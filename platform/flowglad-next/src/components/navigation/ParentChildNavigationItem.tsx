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
        <div className="relative ml-[26px] mt-1 flex flex-col gap-1">
          {/* Vertical line that only spans between first and last dots */}
          <div className="absolute left-[8px] top-[14px] bottom-[14px] w-[1px] bg-stroke-subtle" />
          
          {childItems.map((item) => (
            <NavigationMenuLink
              key={item.href}
              href={item.href}
              selected={pathname === item.href}
              isChild
              className="relative pl-7 h-7 flex items-center"
            >
              {/* Dot centered with line and text */}
              <div className="absolute left-[5px] top-1/2 -translate-y-1/2 flex items-center justify-center">
                <div 
                  className={`h-[6px] w-[6px] rounded-full ${
                    pathname === item.href ? 'bg-on-primary-container' : 'bg-subtle'
                  }`} 
                />
              </div>
              {item.label}
            </NavigationMenuLink>
          ))}
        </div>
      )}
    </NavigationMenuItem>
  )
}