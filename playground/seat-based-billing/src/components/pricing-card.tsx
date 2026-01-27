'use client'

import { useBilling } from '@flowglad/nextjs'
import { Check } from 'lucide-react'
import { useState } from 'react'
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

export interface PricingPlan {
  name: string
  description?: string
  displayPrice: string
  slug: string
  features: string[]
  isPopular?: boolean
  unitPrice: number
  singularQuantityLabel?: string
  pluralQuantityLabel?: string
}

interface PricingCardProps {
  plan: PricingPlan
  isCurrentPlan?: boolean
  hideFeatures?: boolean
}

/**
 * PricingCard component displays a single pricing plan
 */
export function PricingCard({
  plan,
  isCurrentPlan = false,
  hideFeatures = false,
}: PricingCardProps) {
  const billing = useBilling()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)

  // Determine if this plan supports quantity selection (non-free plans with unitPrice > 0)
  const supportsQuantity = plan.unitPrice > 0

  if (!billing.loaded) {
    return <div>Loading...</div>
  }

  if (billing.errors) {
    return <div>Error loading billing data</div>
  }

  if (!billing.createCheckoutSession) {
    return <div>Billing not available</div>
  }

  const priceSlug = plan.slug
  const displayPrice = plan.displayPrice

  // Check if this plan is a default plan by checking the pricing model
  const isDefaultPlan = isDefaultPlanBySlug(
    billing.pricingModel,
    priceSlug
  )

  // Calculate total price for display
  const totalPrice = supportsQuantity
    ? (plan.unitPrice * quantity) / 100
    : plan.unitPrice / 100
  const displayTotalPrice = `$${totalPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  const quantityLabel =
    quantity === 1
      ? (plan.singularQuantityLabel ?? 'unit')
      : (plan.pluralQuantityLabel ?? 'units')

  const handleCheckout = async () => {
    setError(null)

    setIsLoading(true)
    try {
      await billing.createCheckoutSession({
        priceSlug: priceSlug,
        quantity: supportsQuantity ? quantity : undefined,
        successUrl: `${window.location.origin}/`,
        cancelUrl: window.location.href,
        autoRedirect: true,
      })
    } catch (error) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : 'Failed to start checkout. Please try again.'
      setError(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card
      className={cn(
        'relative flex h-full flex-col transition-transform hover:-translate-y-px',
        plan.isPopular && 'border-primary shadow-lg',
        isCurrentPlan && 'border-2 border-primary'
      )}
    >
      {plan.isPopular && (
        <div className="absolute -top-2 md:-top-3 left-1/2 -translate-x-1/2">
          <Badge variant="default" className="text-xs px-1.5 py-0">
            Popular
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
              {supportsQuantity ? displayTotalPrice : displayPrice}
            </span>
            <span className="text-muted-foreground text-xs md:text-sm">
              /month
            </span>
          </div>
          {supportsQuantity && quantity > 1 && (
            <div className="text-xs text-muted-foreground mt-1">
              {displayPrice} × {quantity} {quantityLabel}
            </div>
          )}
        </div>

        {/* Quantity Selector for paid plans */}
        {supportsQuantity && (
          <div className="mt-3 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
            >
              -
            </Button>
            <span className="w-12 text-center font-medium">
              {quantity}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => setQuantity(Math.min(100, quantity + 1))}
              disabled={quantity >= 100}
            >
              +
            </Button>
            <span className="text-sm text-muted-foreground">
              {quantityLabel}
            </span>
          </div>
        )}
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
            variant={plan.isPopular ? 'default' : 'outline'}
            disabled={
              isCurrentPlan ||
              isDefaultPlan ||
              isLoading ||
              !billing.loaded ||
              !billing.createCheckoutSession ||
              !billing.getPrice
            }
            size="sm"
            onClick={handleCheckout}
          >
            {isLoading
              ? 'Loading...'
              : isCurrentPlan
                ? 'Current Plan'
                : 'Get Started'}
          </Button>
          {error && (
            <p className="text-xs text-destructive text-center">
              {error}
            </p>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}
