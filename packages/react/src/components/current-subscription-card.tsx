'use client'
import { useCallback, useState } from 'react'
import {
  Subscription,
  SubscriptionItem,
  CurrencyCode,
  Product,
} from '@flowglad/types'
import { format } from 'date-fns'

import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card'
import { PriceLabel } from './currency-label'
import { CancelSubscriptionModal } from './cancel-subscription-modal'
import {
  SubscriptionCardSubscription,
  SubscriptionCardSubscriptionItem,
} from '../types'
import { useBilling } from '../FlowgladContext'

export interface CurrentSubscriptionCardProps {
  currency: CurrencyCode
  subscription: SubscriptionCardSubscription
  subscriptionItems: SubscriptionCardSubscriptionItem[]
  product: Pick<Product, 'name' | 'pluralQuantityLabel'>
}

const formatDate = (date: Date | string) => {
  return format(new Date(date), 'MMM d, yyyy')
}

const isInFuture = (date: Date | string) => {
  return new Date(date) > new Date()
}

export const CurrentSubscriptionCard = ({
  subscription,
  product,
  currency,
  subscriptionItems,
}: CurrentSubscriptionCardProps) => {
  const showTrialEnd =
    subscription.trialEnd && isInFuture(subscription.trialEnd)
  const isPastDue = subscription.status === 'past_due'
  const billing = useBilling()
  const shouldShowBillingPeriodEnd =
    !subscription.cancelScheduledAt ||
    (subscription.cancelScheduledAt &&
      new Date(subscription.cancelScheduledAt) >
        new Date(subscription.currentBillingPeriodEnd))
  const { cancelSubscription } = billing
  const onCancel = useCallback(
    async (subscription: SubscriptionCardSubscription) => {
      if (!cancelSubscription) {
        return
      }
      await cancelSubscription({
        id: subscription.id,
        cancellation: {
          timing: 'at_end_of_current_billing_period',
        },
      })
    },
    [cancelSubscription]
  )

  return (
    <Card className="flowglad-w-full">
      <CardHeader>
        <div className="flowglad-flex flowglad-flex-row flowglad-justify-between flowglad-w-full">
          <div className="flowglad-flex flowglad-flex-col flowglad-gap-2">
            <div className="flowglad-flex flowglad-items-center flowglad-gap-4">
              <CardTitle>{product.name}</CardTitle>
              <Badge variant="secondary">Current Plan</Badge>
            </div>
            <CardDescription className="flowglad-flex flowglad-flex-row flowglad-items-start">
              <div>
                {subscription.cancelScheduledAt && (
                  <div className="flowglad-text-destructive">
                    Cancels on{' '}
                    {formatDate(subscription.cancelScheduledAt)}
                  </div>
                )}
                {showTrialEnd && (
                  <div>
                    Trial ends on {formatDate(subscription.trialEnd!)}
                  </div>
                )}
                {isPastDue && (
                  <div className="flowglad-text-destructive">
                    Payment Past Due
                  </div>
                )}
                {shouldShowBillingPeriodEnd &&
                  !subscription.cancelScheduledAt && (
                    <div>
                      Renews on{' '}
                      {formatDate(
                        subscription.currentBillingPeriodEnd
                      )}
                    </div>
                  )}
              </div>
            </CardDescription>
          </div>
          {product.pluralQuantityLabel && (
            <div className="flowglad-flex flowglad-flex-col flowglad-gap-2 flowglad-items-end">
              <CardTitle>{product.pluralQuantityLabel}</CardTitle>
              <div className="flowglad-text-end">
                {subscriptionItems[0].quantity}
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flowglad-flex flowglad-items-center flowglad-justify-between">
        <PriceLabel
          price={{
            currency,
            unitPrice: subscriptionItems[0].unitPrice,
            type: 'subscription',
            intervalUnit: subscription.interval,
            intervalCount: subscription.intervalCount,
          }}
        />
        {!subscription.cancelScheduledAt && (
          <CancelSubscriptionModal
            subscription={subscription}
            cancelSubscription={onCancel}
          />
        )}
      </CardContent>
    </Card>
  )
}
