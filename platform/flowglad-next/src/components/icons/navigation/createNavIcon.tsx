import type { LucideIcon, LucideProps } from 'lucide-react'
import React from 'react'
import { cn } from '@/lib/utils'

/** Standard navigation icon size in pixels */
export const NAV_ICON_SIZE = 20

/** Standard navigation icon stroke width in pixels */
export const NAV_ICON_STROKE_WIDTH = 2

export interface NavIconProps extends LucideProps {
  size?: number | string
  strokeWidth?: number | string
}

/**
 * Wraps a Lucide icon with navigation-standard defaults.
 * Ensures all icons render at 20px with 2px strokes by default.
 *
 * @example
 * ```tsx
 * import { Gauge } from 'lucide-react'
 * export const DashboardIcon = createNavIcon(Gauge, 'DashboardIcon')
 * ```
 */
export function createNavIcon(
  Icon: LucideIcon,
  displayName: string
): LucideIcon {
  const NavIcon = React.forwardRef<SVGSVGElement, NavIconProps>(
    (
      {
        size = NAV_ICON_SIZE,
        strokeWidth = NAV_ICON_STROKE_WIDTH,
        className,
        ...props
      },
      ref
    ) => (
      <Icon
        ref={ref}
        size={size}
        strokeWidth={strokeWidth}
        className={cn('shrink-0', className)}
        {...props}
      />
    )
  ) as LucideIcon
  NavIcon.displayName = displayName
  return NavIcon
}
