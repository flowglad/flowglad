'use client'

import { Badge } from '@/components/ui/badge'
import { formatDaysRemaining } from '@/registry/lib/billing-interval'
import { cn } from '@/registry/lib/cn'
import {
  getStatusBadgeVariant,
  getStatusLabel,
} from '@/registry/lib/subscription-status'
import type { SubscriptionHeaderProps } from './types'

export function SubscriptionHeader({
  name,
  status,
  trialEnd,
  className,
}: SubscriptionHeaderProps) {
  return (
    <div
      className={cn('flex items-start justify-between', className)}
    >
      <div className="space-y-1">
        <h3 className="text-lg">{name}</h3>
        {status === 'trialing' && trialEnd && (
          <p className="text-sm text-muted-foreground">
            Trial: {formatDaysRemaining(trialEnd)}
          </p>
        )}
      </div>
      <Badge variant={getStatusBadgeVariant(status)}>
        {getStatusLabel(status)}
      </Badge>
    </div>
  )
}
