'use client'

import { ChartPie } from 'lucide-react'
import * as React from 'react'
import { trpc } from '@/app/_trpc/client'
import { ResourceDetailModal } from '@/components/subscriptions/ResourceDetailModal'
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
  onClick: () => void
}

/**
 * Displays a single resource usage item with progress bar visualization
 */
const ResourceUsageItem = ({
  resourceSlug,
  capacity,
  claimed,
  onClick,
}: Omit<ResourceUsageItemProps, 'available'>) => {
  const usagePercentage =
    capacity > 0 ? Math.min((claimed / capacity) * 100, 100) : 0

  // Show ratio for small capacities, percentage for large ones
  const usageDisplay =
    capacity < 100
      ? `${claimed} of ${capacity} claimed`
      : `${Math.round(usagePercentage)}% used`

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-3 p-3 w-full rounded-md border border-border bg-card text-left hover:bg-accent/50 transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <ChartPie className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-sm">{resourceSlug}</span>
      </div>
      <Progress value={usagePercentage} className="h-2" />
      <span className="text-xs text-muted-foreground">
        {usageDisplay}
      </span>
    </button>
  )
}

/**
 * Loading skeleton for resource usage items
 */
const ResourceUsageSkeleton = () => (
  <div className="flex flex-col gap-3 p-3 w-full rounded-md border border-border bg-card">
    <div className="flex items-center gap-2">
      <Skeleton className="h-4 w-4" />
      <Skeleton className="h-4 w-16" />
    </div>
    <Skeleton className="h-2 w-full" />
    <Skeleton className="h-3 w-24" />
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
interface SelectedResource {
  resourceSlug: string
  capacity: number
  claimed: number
  available: number
}

export const SubscriptionResourceUsage = ({
  subscriptionId,
  className,
}: SubscriptionResourceUsageProps) => {
  const [selectedResource, setSelectedResource] =
    React.useState<SelectedResource | null>(null)
  const [modalOpen, setModalOpen] = React.useState(false)

  const { data, isLoading, error } =
    trpc.resourceClaims.listResourceUsages.useQuery({
      subscriptionId,
    })

  const handleResourceClick = (resource: SelectedResource) => {
    setSelectedResource(resource)
    setModalOpen(true)
  }

  if (isLoading) {
    return (
      <div className={cn('grid grid-cols-2 gap-2 w-full', className)}>
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

  if (!data || data.length === 0) {
    return null
  }

  return (
    <>
      <div className={cn('grid grid-cols-2 gap-2 w-full', className)}>
        {data.map(({ usage }) => (
          <ResourceUsageItem
            key={usage.resourceId}
            resourceSlug={usage.resourceSlug}
            capacity={usage.capacity}
            claimed={usage.claimed}
            onClick={() =>
              handleResourceClick({
                resourceSlug: usage.resourceSlug,
                capacity: usage.capacity,
                claimed: usage.claimed,
                available: usage.available,
              })
            }
          />
        ))}
      </div>

      {selectedResource && (
        <ResourceDetailModal
          resourceSlug={selectedResource.resourceSlug}
          capacity={selectedResource.capacity}
          claimed={selectedResource.claimed}
          available={selectedResource.available}
          open={modalOpen}
          onOpenChange={setModalOpen}
        />
      )}
    </>
  )
}
