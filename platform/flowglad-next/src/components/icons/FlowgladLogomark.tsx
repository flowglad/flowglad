import type { LucideIcon, LucideProps } from 'lucide-react'
import React from 'react'
import { cn } from '@/lib/utils'
import { NAV_ICON_SIZE } from './navigation/createNavIcon'

/**
 * Flowglad logomark icon (interconnected circles symbol without wordmark).
 * Uses 24x24 viewBox for consistency with Lucide icons.
 * Note: This is a filled icon, not stroked.
 */
export const FlowgladLogomark: LucideIcon = React.forwardRef<
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
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12.0042 0C15.2663 9.33447e-07 17.9745 2.38267 18.4998 5.51072C21.6227 6.04047 24 8.7461 24 12.0043C24 15.2674 21.6154 17.9764 18.4854 18.5003C17.9555 21.6229 15.2499 24 11.9917 24C8.72783 24 6.01839 21.6148 5.4951 18.4843C2.37473 17.9524 6.99012e-06 15.248 0 11.9916C0 8.72972 2.38275 6.02154 5.51092 5.49618C6.04221 2.37528 8.74713 0 12.0042 0ZM10.9045 13.3874C9.15803 13.8666 7.87424 15.4723 7.87423 17.3794C7.87423 19.6647 9.71765 21.5173 11.9917 21.5173C13.8999 21.5173 15.5048 20.2128 15.9718 18.4427C13.439 17.8972 11.4462 15.9098 10.9045 13.3874ZM18.4436 8.02462C17.899 10.5586 15.9112 12.5527 13.3878 13.0947C13.8681 14.8394 15.4731 16.1216 17.3791 16.1216C19.6645 16.1216 21.5172 14.2783 21.5172 12.0044C21.5172 10.0966 20.2131 8.49195 18.4436 8.02462ZM6.6209 7.87428C4.33553 7.87428 2.48281 9.71762 2.4828 11.9915C2.4828 13.8981 3.78532 15.5019 5.55325 15.9704C6.09966 13.4371 8.08889 11.4443 10.613 10.9042C10.1337 9.1579 8.52797 7.87429 6.6209 7.87428ZM12.0042 2.48268C10.0977 2.48268 8.49386 3.78488 8.02525 5.55249C10.5603 6.09727 12.555 8.08648 13.0961 10.6112C14.8401 10.1304 16.1217 8.52588 16.1217 6.62052C16.1216 4.33525 14.2782 2.48268 12.0042 2.48268Z"
      fill="currentColor"
    />
  </svg>
))

FlowgladLogomark.displayName = 'FlowgladLogomark'
