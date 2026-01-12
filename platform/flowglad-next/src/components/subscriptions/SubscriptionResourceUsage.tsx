'use client'

import { Database } from 'lucide-react'
import { trpc } from '@/app/_trpc/client'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface SubscriptionResourceUsageProps {
  subscriptionId: string
  className?: string
}

interface ResourceUsageItemProps {
  resourceSlug: string
  capacity: number
  claimed: number
  available: number
}

/**
 * Displays a single resource usage item with progress bar visualization
 */
const ResourceUsageItem = ({
  resourceSlug,
  capacity,
  claimed,
  available,
}: ResourceUsageItemProps) => {
  const usagePercentage =
    capacity > 0 ? (claimed / capacity) * 100 : 0

  return (
    <div className="flex flex-col gap-2 p-3 rounded-md border border-border bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{resourceSlug}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {available} available
        </span>
      </div>
      <Progress value={usagePercentage} className="h-2" />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {claimed} / {capacity} claimed
        </span>
        <span>{Math.round(usagePercentage)}% used</span>
      </div>
    </div>
  )
}

/**
 * Loading skeleton for resource usage items
 */
const ResourceUsageSkeleton = () => (
  <div className="flex flex-col gap-2 p-3 rounded-md border border-border bg-card">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-3 w-16" />
    </div>
    <Skeleton className="h-2 w-full" />
    <div className="flex items-center justify-between">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-3 w-12" />
    </div>
  </div>
)

/**
 * SubscriptionResourceUsage component
 *
 * Fetches and displays resource usage information for a subscription.
 * Shows capacity/claimed/available for each resource type with a visual
 * progress bar representation.
 *
 * @example
 * ```tsx
 * <SubscriptionResourceUsage subscriptionId="sub_123" />
 * ```
 */
export const SubscriptionResourceUsage = ({
  subscriptionId,
  className,
}: SubscriptionResourceUsageProps) => {
  const { data, isLoading, error } =
    trpc.resourceClaims.getUsage.useQuery({
      subscriptionId,
    })

  if (isLoading) {
    return (
      <div className={cn('flex flex-col gap-3', className)}>
        <ResourceUsageSkeleton />
        <ResourceUsageSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div
        className={cn(
          'text-sm text-muted-foreground text-center py-4',
          className
        )}
      >
        Failed to load resource usage.
      </div>
    )
  }

  if (!data?.usage || data.usage.length === 0) {
    return null
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {data.usage.map((resource) => (
        <ResourceUsageItem
          key={resource.resourceId}
          resourceSlug={resource.resourceSlug}
          capacity={resource.capacity}
          claimed={resource.claimed}
          available={resource.available}
        />
      ))}
    </div>
  )
}
