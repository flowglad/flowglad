import { cn } from '@/lib/utils'

interface OnboardingContentProps {
  children?: React.ReactNode
  className?: string
}

/**
 * Content area within OnboardingShell that vertically centers its children.
 * Use flex-1 to fill available space and center content within.
 */
export function OnboardingContent({
  children,
  className,
}: OnboardingContentProps) {
  return (
    <div
      className={cn(
        'flex-1 flex flex-col justify-center py-8',
        className
      )}
    >
      {children}
    </div>
  )
}
