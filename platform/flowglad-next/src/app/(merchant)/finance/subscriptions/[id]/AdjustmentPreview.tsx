'use client'

import { type CurrencyCode } from '@db-core/enums'
import { ArrowRight, CreditCard } from 'lucide-react'
import type { z } from 'zod'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type {
  PreviewSubscriptionItem,
  previewAdjustSubscriptionOutputSchema,
} from '@/subscriptions/schemas'
import core from '@/utils/core'
import { getCurrencyParts } from '@/utils/stripe'

type PreviewAdjustSubscriptionOutput = z.infer<
  typeof previewAdjustSubscriptionOutputSchema
>

interface AdjustmentPreviewProps {
  preview: PreviewAdjustSubscriptionOutput | undefined
  isLoading: boolean
  currency?: CurrencyCode
}

export const AdjustmentPreview = ({
  preview,
  isLoading,
  currency = 'usd' as CurrencyCode,
}: AdjustmentPreviewProps) => {
  if (isLoading) {
    return (
      <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-4 w-48" />
      </div>
    )
  }

  if (!preview) {
    return null
  }

  // Handle canAdjust: false case
  if (!preview.canAdjust) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          <span className="font-medium">
            Cannot adjust subscription:{' '}
          </span>
          {preview.reason}
        </AlertDescription>
      </Alert>
    )
  }

  const formatCurrency = (amount: number) => {
    const { symbol, value } = getCurrencyParts(currency, amount, {
      hideZeroCents: true,
    })
    return `${symbol}${value}`
  }

  const formatDate = (epochMs: number) => {
    return core.formatDate(new Date(epochMs))
  }

  return (
    <div className="border rounded-lg bg-muted/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/50">
        <span className="text-sm font-medium">Preview</span>
        {preview.isUpgrade !== undefined && (
          <Badge
            variant={preview.isUpgrade ? 'default' : 'secondary'}
          >
            {preview.isUpgrade ? 'Upgrade' : 'Downgrade'}
          </Badge>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Current vs New Plan */}
        {preview.currentSubscriptionItems &&
          preview.newSubscriptionItems && (
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Current
                </p>
                <p className="text-sm font-medium leading-tight">
                  {preview.currentSubscriptionItems
                    .map(
                      (item: PreviewSubscriptionItem) =>
                        `${item.name} x${item.quantity}`
                    )
                    .join(', ')}
                </p>
                {preview.currentPlanTotal !== undefined && (
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(preview.currentPlanTotal)}/period
                  </p>
                )}
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground mt-5" />
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  New
                </p>
                <p className="text-sm font-medium leading-tight">
                  {preview.newSubscriptionItems
                    .map(
                      (item: PreviewSubscriptionItem) =>
                        `${item.name} x${item.quantity}`
                    )
                    .join(', ')}
                </p>
                {preview.newPlanTotal !== undefined && (
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(preview.newPlanTotal)}/period
                  </p>
                )}
              </div>
            </div>
          )}

        {/* Timing and Effective Date */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              When
            </p>
            <p className="text-sm font-medium">
              {preview.resolvedTiming === 'immediately'
                ? 'Immediately'
                : 'End of billing period'}
            </p>
          </div>
          {/* Spacer to match arrow column width */}
          <div className="w-4" />
          {preview.effectiveDate && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Effective Date
              </p>
              <p className="text-sm font-medium">
                {formatDate(preview.effectiveDate)}
              </p>
            </div>
          )}
        </div>

        {/* Proration Amount */}
        {preview.prorationAmount !== undefined &&
          preview.prorationAmount !== 0 && (
            <div className="pt-4 border-t space-y-1">
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-medium">
                  Amount Due Today
                </span>
                <span className="text-base font-semibold">
                  {formatCurrency(preview.prorationAmount)}
                </span>
              </div>
              {preview.percentThroughBillingPeriod !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Prorated for{' '}
                  {Math.round(
                    (1 - preview.percentThroughBillingPeriod) * 100
                  )}
                  % remaining in billing period
                </p>
              )}
              {preview.paymentMethod && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>
                    {preview.paymentMethod.brand
                      ? `${preview.paymentMethod.brand} `
                      : ''}
                    {preview.paymentMethod.last4
                      ? `····${preview.paymentMethod.last4}`
                      : preview.paymentMethod.type}
                  </span>
                </div>
              )}
            </div>
          )}

        {/* No charge for end-of-period adjustments */}
        {preview.resolvedTiming ===
          'at_end_of_current_billing_period' && (
          <Alert>
            <AlertDescription className="text-sm">
              No charge today. The new plan will take effect on{' '}
              {preview.billingPeriodEnd
                ? formatDate(preview.billingPeriodEnd)
                : 'the next billing date'}
              .
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}
