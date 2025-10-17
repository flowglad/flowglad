import React from 'react'
import type { LucideIcon, LucideProps } from 'lucide-react'

export const UsageLimitIcon: LucideIcon = React.forwardRef<
  SVGSVGElement,
  LucideProps
>(({ className, ...props }, ref) => (
  <svg
    ref={ref}
    width="36"
    height="19"
    viewBox="0 0 36 19"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <g clipPath="url(#clip0_15376_533)">
      <rect
        y="0.5"
        width="4"
        height="18"
        rx="2"
        fill="currentColor"
      />
      <path
        d="M8 2.5C8 1.39543 8.89543 0.5 10 0.5V0.5C11.1046 0.5 12 1.39543 12 2.5V16.5C12 17.6046 11.1046 18.5 10 18.5V18.5C8.89543 18.5 8 17.6046 8 16.5V2.5Z"
        fill="currentColor"
      />
      <path
        d="M16 2.5C16 1.39543 16.8954 0.5 18 0.5V0.5C19.1046 0.5 20 1.39543 20 2.5V16.5C20 17.6046 19.1046 18.5 18 18.5V18.5C16.8954 18.5 16 17.6046 16 16.5V2.5Z"
        fill="currentColor"
      />
      <rect
        x="24"
        y="0.5"
        width="4"
        height="18"
        rx="2"
        fill="currentColor"
        fillOpacity="0.5"
      />
      <rect
        x="32"
        y="0.5"
        width="4"
        height="18"
        rx="2"
        fill="currentColor"
        fillOpacity="0.5"
      />
    </g>
    <defs>
      <clipPath id="clip0_15376_533">
        <rect
          width="36"
          height="18"
          fill="white"
          transform="translate(0 0.5)"
        />
      </clipPath>
    </defs>
  </svg>
))

UsageLimitIcon.displayName = 'UsageLimitIcon'
