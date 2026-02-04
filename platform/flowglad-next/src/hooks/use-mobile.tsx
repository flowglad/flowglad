import * as React from 'react'

/** Tailwind's `sm` breakpoint (640px) */
export const BREAKPOINT_SM = 640
/** Tailwind's `md` breakpoint (768px) */
export const BREAKPOINT_MD = 768

/**
 * Hook to detect if the viewport is below a given breakpoint.
 *
 * Default value is `false` (desktop) to match SSR expectations and prevent
 * layout shift for desktop users (the majority of users). Mobile users may
 * see a brief flash, but this is preferable to desktop users experiencing
 * layout shifts.
 *
 * @param breakpoint - The max-width breakpoint in pixels. Defaults to 768 (md).
 */
export function useIsMobile(breakpoint: number = BREAKPOINT_MD) {
  // Default to false (desktop) to prevent layout shift during hydration
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < breakpoint)
    }

    // Check immediately on mount
    checkMobile()

    // Listen for viewport changes
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    mql.addEventListener('change', checkMobile)

    return () => mql.removeEventListener('change', checkMobile)
  }, [breakpoint])

  return isMobile
}
