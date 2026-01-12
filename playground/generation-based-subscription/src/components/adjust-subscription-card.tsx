'use client'

import { useBilling } from '@flowglad/nextjs'
import { ArrowDown, ArrowUp, Check, Minus } from 'lucide-react'
import type { PricingPlan } from '@/components/pricing-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { isDefaultPlanBySlug } from '@/lib/billing-helpers'
import { cn } from '@/lib/utils'

interface AdjustSubscriptionCardProps {
  plan: PricingPlan
  isCurrentPlan?: boolean
  currentPlanPrice?: number
  billingPeriodEnd?: string | number | null
  hideFeatures?: boolean
  onAdjustClick?: (plan: PricingPlan, isUpgrade: boolean) => void
}

/**
 * AdjustSubscriptionCard component displays a single pricing plan
 * with the ability to switch to it from an existing subscription
 */
export function AdjustSubscriptionCard({
  plan,
  isCurrentPlan = false,
  currentPlanPrice = 0,
  billingPeriodEnd,
  hideFeatures = false,
  onAdjustClick,
}: AdjustSubscriptionCardProps) {
  const billing = useBilling()

  if (!billing.loaded) {
    return <div>Loading...</div>
  }

  if (billing.errors) {
    return <div>Error loading billing data</div>
  }

  if (!billing.loadBilling) {
    return <div>Billing not available</div>
  }

  if (!billing.getPrice) {
    return <div>Billing not available</div>
  }

  const priceSlug = plan.slug
  const displayPrice = plan.displayPrice

  // Check if this plan is a default plan by checking the pricing model
  const isDefaultPlan = isDefaultPlanBySlug(
    billing.pricingModel,
    priceSlug
  )

  // Get the price for this plan to compare with current plan
  const price = billing.getPrice(priceSlug)
  const planPrice = price?.unitPrice ?? 0

  // Determine if this is an upgrade or downgrade
  const isUpgrade = planPrice > currentPlanPrice
  const isDowngrade = planPrice < currentPlanPrice
  const isSamePrice = planPrice === currentPlanPrice

  // Format the billing period end date (accepts string or number timestamp)
  const formatDate = (dateInput: string | number) => {
    const date = new Date(dateInput)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const handleClick = () => {
    onAdjustClick?.(plan, isUpgrade)
  }

  // Determine button text and variant
  const getButtonContent = () => {
    if (isCurrentPlan) {
      return 'Current Plan'
    }
    if (isUpgrade) {
      return (
        <>
          <ArrowUp className="mr-1 h-4 w-4" />
          Upgrade
        </>
      )
    }
    if (isDowngrade) {
      return (
        <>
          <ArrowDown className="mr-1 h-4 w-4" />
          Downgrade
        </>
      )
    }
    return (
      <>
        <Minus className="mr-1 h-4 w-4" />
        Switch Plan
      </>
    )
  }

  const getButtonVariant = () => {
    if (isCurrentPlan) return 'outline' as const
    if (plan.isPopular) return 'default' as const
    if (isUpgrade) return 'default' as const
    return 'outline' as const
  }

  // Get timing badge text
  const getTimingBadgeText = () => {
    if (isUpgrade) {
      return 'Immediate'
    }
    if (billingPeriodEnd) {
      return `Starts ${formatDate(billingPeriodEnd)}`
    }
    return 'End of period'
  }

  return (
    <Card
      className={cn(
        'relative flex h-full flex-col transition-transform hover:-translate-y-px',
        plan.isPopular && 'border-primary shadow-lg',
        isCurrentPlan && 'border-2 border-primary'
      )}
    >
      {plan.isPopular && !isCurrentPlan && (
        <div className="absolute -top-2 md:-top-3 left-1/2 -translate-x-1/2">
          <Badge variant="default" className="text-xs px-1.5 py-0">
            Popular
          </Badge>
        </div>
      )}

      {isCurrentPlan && (
        <div className="absolute -top-2 md:-top-3 left-1/2 -translate-x-1/2">
          <Badge
            variant="secondary"
            className="text-xs px-1.5 py-0 bg-primary text-primary-foreground"
          >
            Current
          </Badge>
        </div>
      )}

      <CardHeader className="px-3 py-3 md:px-6 md:py-4">
        <CardTitle className="text-lg md:text-2xl">
          {plan.name}
        </CardTitle>
        {plan.description && (
          <CardDescription className="text-xs md:text-base mt-1">
            {plan.description}
          </CardDescription>
        )}
        <div className="mt-1 md:mt-2">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl md:text-4xl font-bold">
              {displayPrice}
            </span>
            <span className="text-muted-foreground text-xs md:text-sm">
              /month
            </span>
          </div>
          {!isCurrentPlan && !isSamePrice && (
            <div className="mt-1">
              <Badge
                variant={isUpgrade ? 'default' : 'secondary'}
                className="text-xs"
              >
                {getTimingBadgeText()}
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>

      {!hideFeatures && (
        <CardContent className="flex-1 px-3 md:px-6 pt-0">
          <ul className="space-y-1.5 md:space-y-3">
            {plan.features.length === 0 ? (
              <li className="text-muted-foreground text-xs md:text-sm">
                No features included
              </li>
            ) : (
              plan.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-1.5 md:gap-2"
                >
                  <Check className="mt-0.5 h-3 w-3 md:h-4 md:w-4 shrink-0 text-primary" />
                  <span className="text-xs md:text-sm">
                    {feature}
                  </span>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      )}

      <CardFooter className="px-3 py-3 md:px-6 md:py-4 mt-auto">
        <div className="w-full space-y-2">
          <Button
            className="w-full text-xs md:text-sm"
            variant={getButtonVariant()}
            disabled={
              isCurrentPlan ||
              isDefaultPlan ||
              !billing.loaded ||
              !billing.adjustSubscription ||
              !billing.getPrice
            }
            size="sm"
            onClick={handleClick}
          >
            {getButtonContent()}
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
