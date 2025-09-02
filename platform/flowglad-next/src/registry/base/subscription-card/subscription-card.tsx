'use client'

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/utils/core'
import { SubscriptionCardProps } from './types'
import { SubscriptionHeader } from './components/subscription-header'
import { SubscriptionDetails } from './components/subscription-details'
import { SubscriptionActions } from './components/subscription-actions'

export function SubscriptionCard({
  subscription,
  onCancel,
  loading = false,
  className,
}: SubscriptionCardProps) {
  if (loading) {
    return <SubscriptionCardSkeleton className={className} />
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <SubscriptionHeader
          name={subscription.name}
          status={subscription.status}
          trialEnd={subscription.trialEnd}
        />
      </CardHeader>

      <CardContent>
        <SubscriptionDetails subscription={subscription} />
      </CardContent>

      {onCancel && (
        <CardFooter>
          <SubscriptionActions
            subscriptionId={subscription.id}
            subscriptionName={subscription.name}
            status={subscription.status}
            cancelAtPeriodEnd={subscription.cancelAtPeriodEnd}
            currentPeriodEnd={subscription.currentPeriodEnd}
            onCancel={onCancel}
            loading={loading}
            className="w-full justify-end"
          />
        </CardFooter>
      )}
    </Card>
  )
}

function SubscriptionCardSkeleton({
  className,
}: {
  className?: string
}) {
  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-32" />
        </div>
      </CardContent>

      <CardFooter>
        <Skeleton className="h-9 w-32 ml-auto" />
      </CardFooter>
    </Card>
  )
}

export default SubscriptionCard
