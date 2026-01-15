import * as React from 'react'

const MOBILE_BREAKPOINT = 768

/**
 * Hook to detect if the viewport is mobile-sized.
 *
 * Default value is `false` (desktop) to match SSR expectations and prevent
 * layout shift for desktop users (the majority of users). Mobile users may
 * see a brief flash, but this is preferable to desktop users experiencing
 * layout shifts.
 */
export function useIsMobile() {
  // Default to false (desktop) to prevent layout shift during hydration
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    // Check immediately on mount
    checkMobile()

    // Listen for viewport changes
    const mql = window.matchMedia(
      `(max-width: ${MOBILE_BREAKPOINT - 1}px)`
    )
    mql.addEventListener('change', checkMobile)

    return () => mql.removeEventListener('change', checkMobile)
  }, [])

  return isMobile
}
