import type { LucideIcon, LucideProps } from 'lucide-react'
import React from 'react'

/**
 * A half-filled circle icon representing "Finish Setup" / progress state.
 * Matches the 20x20px sizing convention used in nav icons.
 */
export const FinishSetupIcon: LucideIcon = React.forwardRef<
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
      d="M16.6665 9.99996C16.6665 6.31806 13.6817 3.33329 9.99984 3.33329C6.31794 3.33329 3.33317 6.31806 3.33317 9.99996C3.33317 13.6819 6.31794 16.6666 9.99984 16.6666C13.6817 16.6666 16.6665 13.6819 16.6665 9.99996ZM18.3332 9.99996C18.3332 14.6023 14.6022 18.3333 9.99984 18.3333C5.39746 18.3333 1.6665 14.6023 1.6665 9.99996C1.6665 5.39759 5.39746 1.66663 9.99984 1.66663C14.6022 1.66663 18.3332 5.39759 18.3332 9.99996Z"
      fill="currentColor"
    />
    <path
      d="M14.9998 9.99996C14.9998 12.7614 12.7613 15 9.99984 15L9.99979 4.99996C12.7612 4.99996 14.9998 7.23854 14.9998 9.99996Z"
      fill="currentColor"
    />
  </svg>
))

FinishSetupIcon.displayName = 'FinishSetupIcon'
