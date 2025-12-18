import type { LucideIcon, LucideProps } from 'lucide-react'
import React from 'react'
import { cn } from '@/lib/utils'
import {
  NAV_ICON_SIZE,
  NAV_ICON_STROKE_WIDTH,
} from './navigation/createNavIcon'

/**
 * Custom "more" hamburger menu icon for navigation.
 * Uses 24x24 viewBox for consistency with Lucide icons.
 */
export const MoreIcon: LucideIcon = React.forwardRef<
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
        d="M19 16H5M5 8H19"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
)

MoreIcon.displayName = 'MoreIcon'
