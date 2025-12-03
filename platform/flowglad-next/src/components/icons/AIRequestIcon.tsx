import type { LucideIcon, LucideProps } from 'lucide-react'
import React from 'react'

export const AIRequestIcon: LucideIcon = React.forwardRef<
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
    <rect
      x="4"
      y="4"
      width="28"
      height="28"
      rx="6"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
    />
    <path
      d="M12 14L14 16L12 18"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M17 18H24"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="18" cy="9" r="2" fill="currentColor" opacity="0.5" />
    <circle cx="9" cy="18" r="2" fill="currentColor" opacity="0.5" />
    <circle cx="27" cy="18" r="2" fill="currentColor" opacity="0.5" />
  </svg>
))

AIRequestIcon.displayName = 'AIRequestIcon'
