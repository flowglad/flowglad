'use client'
import { ChevronRight, TriangleRight } from 'lucide-react'
import {
  NavigationMenuItem,
  NavigationMenuLink,
} from '@/components/ion/Navigation'
import { BusinessOnboardingStatus } from '@/types'
import { useAuthContext } from '@/contexts/authContext'
import { usePathname } from 'next/navigation'
import { cn } from '@/utils/core'

const OnboardingNavigationSection = ({
  isCollapsed,
}: {
  isCollapsed: boolean
}) => {
  const pathname = usePathname()
  const selectedPath = pathname
  const { organization } = useAuthContext()
  if (
    organization?.onboardingStatus ===
    BusinessOnboardingStatus.FullyOnboarded
  ) {
    return null
  }
  return (
    <NavigationMenuItem className="w-full">
      <NavigationMenuLink
        iconLeading={
          <TriangleRight size={14} strokeWidth={2} color="orange" />
        }
        iconTrailing={
          isCollapsed ? null : (
            <ChevronRight size={16} strokeWidth={2} />
          )
        }
        className={cn(
          'w-full flex items-center justify-between transition-all duration-300 ease-in-out',
          isCollapsed ? 'justify-center px-2' : 'px-3 gap-3'
        )}
        href="/onboarding"
        selected={selectedPath.startsWith('/onboarding')}
      >
        <span
          className={cn(
            'flex-grow transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap',
            isCollapsed
              ? 'max-w-0 opacity-0 ml-0'
              : 'max-w-xs opacity-100 ml-2'
          )}
        >
          {isCollapsed ? null : 'Set Up'}
        </span>
      </NavigationMenuLink>
    </NavigationMenuItem>
  )
}

export default OnboardingNavigationSection
