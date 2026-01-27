import { cn } from '@/lib/utils'

interface OnboardingShellProps {
  children: React.ReactNode
  className?: string
}

/**
 * Layout shell for onboarding pages with double-dashed border decoration.
 *
 * Features:
 * - Double dashed borders on left/right that extend to viewport edges
 * - Content constrained to max-width with centered alignment
 * - Flexbox layout for proper content distribution
 *
 * Structure:
 * - Outer container: min-h-screen, overflow-x-hidden (clips extended borders)
 * - Border track: draws outer borders via ::before, applies outer padding
 * - Inner track: draws inner borders via ::before, applies inner padding
 * - Children: flex-1 to fill available space
 */
export function OnboardingShell({
  children,
  className,
}: OnboardingShellProps) {
  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col items-center">
      <div
        className={cn(
          // Layout
          'w-full max-w-[var(--onboarding-max-w)] flex-1 flex flex-col',
          // Position context for pseudo-element
          'relative',
          // Padding between outer border and inner container
          'px-[var(--onboarding-border-gap)]',
          // Outer dashed borders via pseudo-element (extends beyond container)
          'before:absolute before:left-0 before:right-0',
          'before:top-[calc(-50vh)] before:bottom-[calc(-50vh)]',
          'before:border-l before:border-r before:border-dashed before:border-border',
          'before:pointer-events-none',
          className
        )}
      >
        <div
          className={cn(
            // Layout - fill parent and establish flex column
            'flex-1 flex flex-col',
            // Position context for pseudo-element
            'relative',
            // Padding between inner border and content
            'px-[var(--onboarding-border-gap)]',
            // Inner dashed borders via pseudo-element (extends beyond container)
            'before:absolute before:left-0 before:right-0',
            'before:top-[calc(-50vh)] before:bottom-[calc(-50vh)]',
            'before:border-l before:border-r before:border-dashed before:border-border',
            'before:pointer-events-none'
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
