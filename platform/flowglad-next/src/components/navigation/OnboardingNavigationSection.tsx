'use client'
import { ChevronRight, TriangleRight } from 'lucide-react'
import { BusinessOnboardingStatus } from '@/types'
import { useAuthContext } from '@/contexts/authContext'
import { usePathname } from 'next/navigation'
import { cn } from '@/utils/core'
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import Link from 'next/link'

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
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={selectedPath.startsWith('/onboarding')}
        tooltip="Set Up"
        className={cn(
          'h-8 text-sm',
          isCollapsed ? 'justify-center gap-0' : ''
        )}
      >
        <Link
          href="/onboarding"
          aria-current={
            selectedPath.startsWith('/onboarding')
              ? 'page'
              : undefined
          }
          className="w-full flex items-center"
        >
          {/* Icon as direct child so [&>svg] styles apply */}
          <TriangleRight size={16} strokeWidth={2} color="orange" />
          {/* Label */}
          <span
            className={cn(
              'transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap',
              isCollapsed
                ? 'max-w-0 opacity-0 ml-0'
                : 'max-w-xs opacity-100'
            )}
          >
            {isCollapsed ? null : 'Set Up'}
          </span>
          {/* Trailing chevron only when expanded */}
          {!isCollapsed && (
            <ChevronRight
              size={16}
              strokeWidth={2}
              className="ml-auto"
            />
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export default OnboardingNavigationSection
