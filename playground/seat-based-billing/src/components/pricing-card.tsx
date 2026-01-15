'use client'

import { useBilling } from '@flowglad/nextjs'
import { Check, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  /** Unit price in cents */
  unitPrice: number
  slug: string
  features: string[]
  isPopular?: boolean
  /** Label for a single unit (e.g., "seat") */
  singularQuantityLabel?: string | null
  /** Label for multiple units (e.g., "seats") */
  pluralQuantityLabel?: string | null
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

  if (!billing.loaded) {
    return <div>Loading...</div>
  }

  if (billing.errors) {
    return <div>Error loading billing data</div>
  }

  if (!billing.loadBilling) {
    return <div>Billing not available</div>
  }

  const priceSlug = plan.slug

  // Check if this plan supports quantity selection (has quantity labels and is not free)
  const supportsQuantity = Boolean(
    plan.singularQuantityLabel && plan.unitPrice > 0
  )

  // Calculate total price based on quantity
  const totalPriceCents = plan.unitPrice * quantity
  const formatPrice = (cents: number): string => {
    const dollars = cents / 100
    return `$${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  }
  const displayPrice = supportsQuantity
    ? formatPrice(totalPriceCents)
    : plan.displayPrice

  // Get the quantity label to display
  const quantityLabel =
    quantity === 1
      ? plan.singularQuantityLabel
      : (plan.pluralQuantityLabel ?? plan.singularQuantityLabel)

  // Check if this plan is a default plan by checking the pricing model
  const isDefaultPlan = isDefaultPlanBySlug(
    billing.pricingModel,
    priceSlug
  )

  const handleQuantityChange = (newQuantity: number) => {
    const clamped = Math.max(1, Math.min(100, newQuantity))
    setQuantity(clamped)
  }

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
              {displayPrice}
            </span>
            <span className="text-muted-foreground text-xs md:text-sm">
              /month
            </span>
          </div>
          {supportsQuantity && (
            <div className="text-xs text-muted-foreground mt-1">
              {formatPrice(plan.unitPrice)} per{' '}
              {plan.singularQuantityLabel}
            </div>
          )}
        </div>

        {/* Quantity Selector */}
        {supportsQuantity && (
          <div className="mt-3 md:mt-4">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleQuantityChange(quantity - 1)}
                disabled={quantity <= 1}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                min={1}
                max={100}
                value={quantity}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleQuantityChange(
                    parseInt(e.target.value, 10) || 1
                  )
                }
                className="w-16 text-center h-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleQuantityChange(quantity + 1)}
                disabled={quantity >= 100}
              >
                <Plus className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {quantityLabel}
              </span>
            </div>
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
