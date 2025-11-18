'use client';

import { useEffect, useState } from 'react';

/**
 * Hook to detect if the screen width is below a certain breakpoint
 * @param breakpoint - The breakpoint width in pixels (default: 768px for mobile)
 * @returns boolean indicating if the screen is below the breakpoint
 */
export function useMobile(breakpoint: number = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(true);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    // Check on mount
    checkMobile();

    // Add event listener
    window.addEventListener('resize', checkMobile);

    // Cleanup
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, [breakpoint]);

  return isMobile;
}
