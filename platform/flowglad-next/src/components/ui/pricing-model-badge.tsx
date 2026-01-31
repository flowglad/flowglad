'use client'

import { Check, FlaskConical, Zap } from 'lucide-react'
import type * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface PricingModelBadgeProps {
  /** Whether the pricing model is in live mode */
  livemode: boolean
  /** Whether this is the default pricing model (only relevant for test mode) */
  isDefault?: boolean
  /** Additional CSS classes */
  className?: string
  /** Size variant */
  size?: 'sm' | 'md'
}

/**
 * Badge component for pricing model status.
 *
 * Displays:
 * - Green "Live" badge for livemode pricing models
 * - Amber "Test" badge for test mode non-default pricing models
 * - Amber "Test - Default" badge for default test pricing models
 */
export function PricingModelBadge({
  livemode,
  isDefault = false,
  className,
  size = 'md',
}: PricingModelBadgeProps) {
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-0.5 text-xs gap-1.5',
  }

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
  }

  if (livemode) {
    return (
      <Badge
        variant="outline"
        role="status"
        aria-label="Live"
        className={cn(
          'bg-jade-background text-jade-foreground border-jade-border',
          sizeStyles[size],
          'font-medium',
          className
        )}
      >
        <span aria-hidden="true">
          <Zap className={cn(iconSizes[size], 'shrink-0')} />
        </span>
        <span>Live</span>
      </Badge>
    )
  }

  // Test mode badge
  const label = isDefault ? 'Test - Default' : 'Test'

  return (
    <Badge
      variant="outline"
      role="status"
      aria-label={label}
      className={cn(
        'bg-citrine-background text-citrine-foreground border-citrine-border',
        sizeStyles[size],
        'font-medium',
        className
      )}
    >
      <span aria-hidden="true">
        {isDefault ? (
          <Check className={cn(iconSizes[size], 'shrink-0')} />
        ) : (
          <FlaskConical className={cn(iconSizes[size], 'shrink-0')} />
        )}
      </span>
      <span>{label}</span>
    </Badge>
  )
}
