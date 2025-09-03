import * as React from 'react'
import { Check, X } from 'lucide-react'
import { cn } from '@/registry/lib/cn'
import type { PricingFeature as PricingFeatureType } from './types'

interface PricingFeatureProps extends PricingFeatureType {
  className?: string
}

export function PricingFeature({
  text,
  included,
  tooltip,
  className,
}: PricingFeatureProps) {
  return (
    <div
      className={cn('flex items-start gap-3', className)}
      title={tooltip}
    >
      <div className="mt-0.5 flex-shrink-0">
        {included ? (
          <Check className="h-5 w-5 text-foreground" />
        ) : (
          <X className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <span
        className={cn(
          'text-sm',
          included ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {text}
      </span>
    </div>
  )
}
