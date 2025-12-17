import { ArrowsClockwise, Users } from '@phosphor-icons/react'
import type { LucideIcon, LucideProps } from 'lucide-react'
import React from 'react'

/**
 * Wrapper around Phosphor's Users icon (bold weight) for type compatibility
 * with Lucide-based navigation components.
 */
export const CustomersIcon: LucideIcon = React.forwardRef<
  SVGSVGElement,
  LucideProps
>(({ className, size = 20, ...props }, ref) => (
  <Users
    ref={ref}
    className={className}
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
>(({ className, size = 20, ...props }, ref) => (
  <ArrowsClockwise
    ref={ref}
    className={className}
    size={size}
    weight="bold"
    {...props}
  />
))
SubscriptionsIcon.displayName = 'SubscriptionsIcon'
