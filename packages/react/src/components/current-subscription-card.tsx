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

export interface CurrentSubscriptionCardProps {
  currency: CurrencyCode
  subscription: Pick<
    Subscription['subscription'],
    | 'id'
    | 'trialEnd'
    | 'status'
    | 'cancelScheduledAt'
    | 'currentBillingPeriodEnd'
    | 'interval'
    | 'intervalCount'
    | 'canceledAt'
  >
  subscriptionItems: Pick<
    SubscriptionItem,
    'id' | 'unitPrice' | 'quantity'
  >[]
  product: Pick<Product, 'name' | 'pluralQuantityLabel'>
  onClickCancel?: () => void
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
  onClickCancel,
  subscriptionItems,
}: CurrentSubscriptionCardProps) => {
  const showTrialEnd =
    subscription.trialEnd && isInFuture(subscription.trialEnd)
  const isPastDue = subscription.status === 'past_due'

  const shouldShowBillingPeriodEnd =
    !subscription.cancelScheduledAt ||
    (subscription.cancelScheduledAt &&
      new Date(subscription.cancelScheduledAt) >
        new Date(subscription.currentBillingPeriodEnd))

  return (
    <Card className="flowglad-w-full">
      <CardHeader className="flowglad-flex flowglad-flex-col flowglad-justify-between flowglad-gap-2">
        <div className="flowglad-flex flowglad-flex-row flowglad-gap-2 flowglad-justify-between">
          <div className="flowglad-flex flowglad-flex-col flowglad-gap-2">
            <div className="flowglad-flex flowglad-items-center flowglad-gap-4">
              <CardTitle>{product.name}</CardTitle>
              <Badge variant="secondary">Current Plan</Badge>
            </div>
            <CardDescription className="flowglad-flex flowglad-flex-row flowglad-justify-between flowglad-items-start">
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
                      Renews on
                      {formatDate(
                        subscription.currentBillingPeriodEnd
                      )}
                    </div>
                  )}
              </div>
            </CardDescription>
          </div>
          <div className="flowglad-flex flowglad-flex-col flowglad-gap-2">
            <CardTitle>{product.pluralQuantityLabel}</CardTitle>
            <div className="flowglad-justify-end flowglad-text-end flowglad-items-start">
              {subscriptionItems[0].quantity}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flowglad-flex flowglad-items-center flowglad-justify-between">
        <PriceLabel
          variant={{
            currency,
            unitPrice: subscriptionItems[0].unitPrice,
            priceType: 'subscription',
            intervalUnit: subscription.interval,
            intervalCount: subscription.intervalCount,
          }}
        />
        <Button variant="outline" onClick={onClickCancel}>
          Cancel
        </Button>
      </CardContent>
    </Card>
  )
}
