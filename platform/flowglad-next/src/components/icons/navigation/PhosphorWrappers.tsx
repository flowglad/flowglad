import { ArrowsClockwise, Users } from '@phosphor-icons/react'
import type { LucideIcon, LucideProps } from 'lucide-react'
import React from 'react'
import { cn } from '@/lib/utils'
import { NAV_ICON_SIZE } from './createNavIcon'

/**
 * Wrapper around Phosphor's Users icon (bold weight) for type compatibility
 * with Lucide-based navigation components.
 */
export const CustomersIcon: LucideIcon = React.forwardRef<
  SVGSVGElement,
  LucideProps
>(({ className, size = NAV_ICON_SIZE, ...props }, ref) => (
  <Users
    ref={ref}
    className={cn('shrink-0', className)}
    size={size}
    weight="bold"
    {...props}
  />
))
CustomersIcon.displayName = 'CustomersIcon'

/**
 * Wrapper around Phosphor's ArrowsClockwise icon for type compatibility
 * with Lucide-based navigation components.
 */
export const SubscriptionsIcon: LucideIcon = React.forwardRef<
  SVGSVGElement,
  LucideProps
>(({ className, size = NAV_ICON_SIZE, ...props }, ref) => (
  <ArrowsClockwise
    ref={ref}
    className={cn('shrink-0', className)}
    size={size}
    weight="bold"
    {...props}
  />
))
SubscriptionsIcon.displayName = 'SubscriptionsIcon'
