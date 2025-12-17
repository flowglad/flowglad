import type { LucideIcon, LucideProps } from 'lucide-react'
import React from 'react'

export const PaymentsIcon: LucideIcon = React.forwardRef<
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
      d="M7.77791 10.5566C7.77791 10.5566 9.02987 11.1122 10.0001 11.1122C10.9704 11.1122 12.2224 10.5566 12.2224 10.5566M2.5 16.25V4.375C2.5 4.20924 2.56585 4.05027 2.68306 3.93306C2.80027 3.81585 2.95924 3.75 3.125 3.75H16.875C17.0408 3.75 17.1997 3.81585 17.3169 3.93306C17.4342 4.05027 17.5 4.20924 17.5 4.375V16.25L15 15L12.5 16.25L10 15L7.5 16.25L5 15L2.5 16.25Z"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
))

PaymentsIcon.displayName = 'PaymentsIcon'
