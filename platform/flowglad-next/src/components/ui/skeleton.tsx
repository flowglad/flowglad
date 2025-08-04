import { cn } from "@/utils/core"
import React from 'react'

type SkeletonTheme = 'default' | 'light' | 'dark'

function Skeleton({
  className,
  theme,
  disableAnimation,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  theme?: SkeletonTheme
  disableAnimation?: boolean
}) {
  return (
    <div className={className}>
      <div
        className={cn(
          'animate-pulse rounded-md bg-[#8d8d8d]',
          disableAnimation && '!animate-none',
          'h-full w-full'
        )}
        {...props}
      />
    </div>
  )
}

Skeleton.displayName = 'Skeleton'

/**
 * Helps elegantly manage the transition between skeleton and inner child.
 * showSkeleton steers a laggier "shouldRender" state.
 * shouldRender determines whether the skeleton is mounted,
 * while showSkeleton determines whether the skeleton is visible.
 * This way, when showSkeleton changes to false, we can transition its opacity, and then unmount the skeleton
 * and mount the child in one go.
 * @param param0
 * @returns
 */
const FallbackSkeleton: React.FC<{
  children: React.ReactNode
  showSkeleton?: boolean
  className?: string
}> = ({ children, showSkeleton, className }) => {
  const [shouldRender, setShouldRender] = React.useState(showSkeleton)

  React.useEffect(() => {
    if (!showSkeleton) {
      const timer = setTimeout(() => {
        setShouldRender(false)
      }, 300)
      return () => clearTimeout(timer)
    }
    setShouldRender(true)
  }, [showSkeleton])

  if (shouldRender) {
    return (
      <Skeleton
        className={cn(
          'transition-opacity duration-300',
          showSkeleton ? 'opacity-100' : 'opacity-0',
          className
        )}
      />
    )
  }

  return <>{children}</>
}

export { Skeleton, FallbackSkeleton }
