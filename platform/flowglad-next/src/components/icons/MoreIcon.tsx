import type { LucideIcon, LucideProps } from 'lucide-react'
import React from 'react'

export const MoreIcon: LucideIcon = React.forwardRef<
  SVGSVGElement,
  LucideProps
>(({ className, ...props }, ref) => (
  <svg
    ref={ref}
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path
      d="M15.8334 13.3334H4.16675M4.16675 6.66669H15.8334"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
))

MoreIcon.displayName = 'MoreIcon'
