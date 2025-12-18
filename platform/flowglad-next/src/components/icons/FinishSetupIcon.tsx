import type { LucideIcon, LucideProps } from 'lucide-react'
import React from 'react'
import { cn } from '@/lib/utils'
import { NAV_ICON_SIZE } from './navigation/createNavIcon'

/**
 * A half-filled circle icon representing "Finish Setup" / progress state.
 * Uses 24x24 viewBox for consistency with Lucide icons.
 * Note: This is a filled icon, not stroked, so strokeWidth is not used.
 */
export const FinishSetupIcon: LucideIcon = React.forwardRef<
  SVGSVGElement,
  LucideProps
>(({ className, size = NAV_ICON_SIZE, ...props }, ref) => (
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
      d="M20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12ZM22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
      fill="currentColor"
    />
    <path
      d="M18 12C18 15.3137 15.3137 18 12 18L12 6C15.3137 6 18 8.68629 18 12Z"
      fill="currentColor"
    />
  </svg>
))

FinishSetupIcon.displayName = 'FinishSetupIcon'
