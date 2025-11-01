import React from 'react'
import type { LucideIcon, LucideProps } from 'lucide-react'

export const AITokenIcon: LucideIcon = React.forwardRef<
  SVGSVGElement,
  LucideProps
>(({ className, ...props }, ref) => (
  <svg
    ref={ref}
    width="36"
    height="36"
    viewBox="0 0 36 36"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <circle
      cx="18"
      cy="18"
      r="16"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
    />
    <path
      d="M18 8V18L26 22"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="18" cy="18" r="2" fill="currentColor" />
    <path
      d="M13 28L15 26M23 28L21 26M10 21L12 20M26 21L24 20"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      opacity="0.5"
    />
  </svg>
))

AITokenIcon.displayName = 'AITokenIcon'
