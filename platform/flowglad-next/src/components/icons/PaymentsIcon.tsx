import type { LucideIcon, LucideProps } from 'lucide-react'
import React from 'react'
import { cn } from '@/lib/utils'
import {
  NAV_ICON_SIZE,
  NAV_ICON_STROKE_WIDTH,
} from './navigation/createNavIcon'

/**
 * Custom payments/receipt icon for navigation.
 * Uses 24x24 viewBox for consistency with Lucide icons.
 */
export const PaymentsIcon: LucideIcon = React.forwardRef<
  SVGSVGElement,
  LucideProps
>(
  (
    {
      className,
      size = NAV_ICON_SIZE,
      strokeWidth = NAV_ICON_STROKE_WIDTH,
      ...props
    },
    ref
  ) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      {...props}
    >
      <path
        d="M9.333 12.668C9.333 12.668 10.836 13.334 12 13.334C13.164 13.334 14.667 12.668 14.667 12.668M3 19.5V5.25C3 5.05109 3.07902 4.86032 3.21967 4.71967C3.36032 4.57902 3.55109 4.5 3.75 4.5H20.25C20.4489 4.5 20.6397 4.57902 20.7803 4.71967C20.921 4.86032 21 5.05109 21 5.25V19.5L18 18L15 19.5L12 18L9 19.5L6 18L3 19.5Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
)

PaymentsIcon.displayName = 'PaymentsIcon'
