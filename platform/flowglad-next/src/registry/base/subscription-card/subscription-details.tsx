'use client'

import { cn } from '@/registry/lib/cn'
import { Calendar, CreditCard, AlertCircle } from 'lucide-react'
import { SubscriptionDetailsProps } from './types'
import { formatBillingInterval } from '@/registry/lib/billing-interval'
import { formatCurrency } from '@/registry/lib/currency'
import { formatDate } from '@/registry/lib/date'
import { calculateTotalAmount } from '@/registry/lib/subscription-total'

export function SubscriptionDetails({
  subscription,
  className,
}: SubscriptionDetailsProps) {
  const totalAmount = calculateTotalAmount(subscription.items)
  const primaryItem = subscription.items[0]
  const billingInterval = primaryItem
    ? formatBillingInterval(
        primaryItem.interval,
        primaryItem.intervalCount
      )
    : ''

  return (
    <div className={cn('space-y-4', className)}>
      {/* Billing Amount */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CreditCard className="h-4 w-4" />
          <span>Billing Amount</span>
        </div>
        <div className="text-right">
          <p className="font-semibold">
            {formatCurrency(totalAmount, subscription.currency)}
          </p>
          {billingInterval && (
            <p className="text-sm text-muted-foreground">
              {billingInterval}
            </p>
          )}
        </div>
      </div>

      {/* Current Period */}
      {subscription.currentPeriodStart &&
        subscription.currentPeriodEnd && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Current Period</span>
            </div>
            <div className="text-right">
              <p className="text-sm">
                {formatDate(subscription.currentPeriodStart)} -{' '}
                {formatDate(subscription.currentPeriodEnd)}
              </p>
            </div>
          </div>
        )}

      {/* Cancellation Notice */}
      {subscription.cancelAtPeriodEnd &&
        subscription.currentPeriodEnd && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">
                Subscription will end on{' '}
                {formatDate(subscription.currentPeriodEnd)}
              </p>
              <p className="text-xs text-amber-700 mt-1">
                You will continue to have access until this date
              </p>
            </div>
          </div>
        )}

      {/* Past Due Notice */}
      {subscription.status === 'past_due' && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 p-3">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900">
              Payment past due
            </p>
            <p className="text-xs text-red-700 mt-1">
              Please update your payment method to continue service
            </p>
          </div>
        </div>
      )}

      {/* Subscription Items */}
      {subscription.items.length > 1 && (
        <div className="border-t pt-4">
          <p className="text-sm font-medium mb-2">
            Subscription Items
          </p>
          <div className="space-y-2">
            {subscription.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-muted-foreground">
                  {item.productName}{' '}
                  {item.quantity > 1 && `(×${item.quantity})`}
                </span>
                <span className="font-medium">
                  {formatCurrency(
                    item.unitAmount * item.quantity,
                    subscription.currency
                  )}
                  {item.usageType === 'metered' && (
                    <span className="text-xs text-muted-foreground ml-1">
                      / usage
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
