'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Provides smooth loading transitions between pages to improve perceived performance
 */
export const SmoothPageTransition = ({
  children,
  showLoader = true,
}: {
  children: React.ReactNode
  showLoader?: boolean
}) => {
  const pathname = usePathname()
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [displayChildren, setDisplayChildren] = useState(children)

  useEffect(() => {
    // Start transition
    setIsTransitioning(true)

    // Small delay to show transition effect
    const timer = setTimeout(() => {
      setDisplayChildren(children)
      setIsTransitioning(false)
    }, 150)

    return () => clearTimeout(timer)
  }, [pathname, children])

  if (isTransitioning && showLoader) {
    return (
      <div className="flex h-32 w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'transition-opacity duration-150',
        isTransitioning ? 'opacity-50' : 'opacity-100'
      )}
    >
      {displayChildren}
    </div>
  )
}

/**
 * Higher-order component to wrap pages with smooth transitions
 */
export const withSmoothTransition = <P extends object>(
  Component: React.ComponentType<P>
) => {
  return function WrappedComponent(props: P) {
    return (
      <SmoothPageTransition>
        <Component {...props} />
      </SmoothPageTransition>
    )
  }
}
