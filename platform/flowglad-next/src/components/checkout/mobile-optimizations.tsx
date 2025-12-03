'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

// Hook to detect mobile viewport
export const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return isMobile
}

// Mobile-optimized container component
export const MobileOptimizedContainer = ({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) => {
  const isMobile = useIsMobile()

  return (
    <div
      className={cn(
        // Progressive container widths matching LS
        'w-full',
        'max-w-[390px] sm:max-w-[768px] lg:max-w-[1536px]',
        'mx-auto',
        className
      )}
    >
      {children}
    </div>
  )
}

// Touch-optimized form field wrapper
export const TouchOptimizedField = ({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) => {
  return (
    <div
      className={cn(
        'min-h-[44px]', // iOS minimum touch target
        'relative',
        className
      )}
    >
      {children}
    </div>
  )
}
