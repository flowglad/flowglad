'use client'

import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TestModeBannerProps {
  pricingModelName?: string
  className?: string
}

/**
 * Full-width amber banner that appears when the user is in a test pricing model.
 * Displays above the sidebar and main content area, in document flow (not sticky/overlay).
 */
export const TestModeBanner: React.FC<TestModeBannerProps> = ({
  pricingModelName,
  className,
}) => {
  return (
    <div
      className={cn(
        'w-full bg-citrine-background border-b border-citrine-border',
        'flex items-center justify-center gap-2 px-4 py-2',
        className
      )}
      role="status"
      aria-live="polite"
      data-testid="test-mode-banner"
    >
      <Info className="h-4 w-4 shrink-0 text-citrine-foreground" />
      <span className="text-sm font-medium text-citrine-foreground">
        You're in a test pricing model
        {pricingModelName && (
          <span className="text-citrine-muted-foreground">
            {' '}
            ({pricingModelName})
          </span>
        )}
      </span>
    </div>
  )
}
