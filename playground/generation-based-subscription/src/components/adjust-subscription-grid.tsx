'use client'

import { useCallback, useMemo, useState } from 'react'
import { useBilling } from '@flowglad/nextjs'
import { AdjustSubscriptionCard } from '@/components/adjust-subscription-card'
import type { PricingPlan } from '@/components/pricing-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardFooter, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useBillingRunRealtime } from '@/hooks/use-billing-run-realtime'

interface BillingRunRealtimeInfo {
  runId: string
  publicAccessToken: string
}

interface AdjustSubscriptionGridProps {
  onSuccess?: () => void
}

/**
 * AdjustSubscriptionGrid component displays all available plans for switching
 */
export function AdjustSubscriptionGrid({
  onSuccess,
}: AdjustSubscriptionGridProps) {
  const billing = useBilling()
  const [selectedPlan, setSelectedPlan] =
    useState<PricingPlan | null>(null)
  const [isUpgrade, setIsUpgrade] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Track billing run realtime info for subscribing to completion
  const [billingRunRealtime, setBillingRunRealtime] =
    useState<BillingRunRealtimeInfo | null>(null)

  // Handle billing run completion via trigger.dev realtime
  const handleBillingRunComplete = useCallback(async () => {
    if (billing.reload) {
      await billing.reload()
    }
    setBillingRunRealtime(null)
    setIsLoading(false)
    setSelectedPlan(null)
    onSuccess?.()
  }, [billing, onSuccess])

  const handleBillingRunError = useCallback((err: Error) => {
    setError(err.message)
    setBillingRunRealtime(null)
    setIsLoading(false)
  }, [])

  // Subscribe to billing run completion using trigger.dev realtime
  useBillingRunRealtime({
    billingRunRealtime,
    onComplete: handleBillingRunComplete,
    onError: handleBillingRunError,
  })

  // Get current subscription and billing period end date
  const currentSubscription = billing.currentSubscriptions?.[0]
  const billingPeriodEnd =
    currentSubscription?.currentBillingPeriodEnd ?? null

  // Get current subscription price for comparison
  const currentPlanPrice = useMemo(() => {
    if (
      !billing.loaded ||
      !billing.loadBilling ||
      billing.errors ||
      !billing.currentSubscriptions ||
      billing.currentSubscriptions.length === 0
    ) {
      return 0
    }

    const currentSub = billing.currentSubscriptions[0]
    const currentPriceId = currentSub?.priceId
    if (!currentPriceId || !billing.getPrice) return 0

    // Find the price by ID in the catalog
    const catalog = billing.catalog
    if (!catalog) return 0

    for (const product of catalog.products) {
      const price = product.prices.find(
        (p) => p.id === currentPriceId
      )
      if (price) {
        return price.unitPrice
      }
    }
    return 0
  }, [billing])

  // Build plans from pricingModel
  const plans = useMemo<PricingPlan[]>(() => {
    // Early return if billing isn't ready or has no pricing model
    if (
      !billing.loaded ||
      !billing.loadBilling ||
      billing.errors ||
      !billing.pricingModel
    ) {
      return []
    }

    const { products } = billing.pricingModel

    // Filter products: subscription type, active, not default/free
    const filteredProducts = products.filter((product) => {
      // Skip default/free products
      if (product.default === true) return false

      // Find active subscription price
      const matchingPrice = product.prices.find(
        (price) =>
          price.type === 'subscription' && price.active === true
      )

      return !!matchingPrice
    })

    // Transform products to PricingPlan format
    const transformedPlans = filteredProducts
      .map((product) => {
        const price = product.prices.find(
          (p) => p.type === 'subscription' && p.active === true
        )

        if (!price || !price.slug) return null

        // Format price from cents to display string
        const formatPrice = (cents: number): string => {
          const dollars = cents / 100
          return `$${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
        }

        const displayPrice = formatPrice(price.unitPrice)

        // Build features list from feature objects (features have name and description)
        const featureNames =
          product.features
            .map((feature) => feature.name)
            .filter(
              (name): name is string =>
                typeof name === 'string' && name.length > 0
            ) ?? []

        const plan: PricingPlan = {
          name: product.name,
          displayPrice: displayPrice,
          slug: price.slug,
          features: featureNames,
        }

        if (product.description) {
          plan.description = product.description
        }

        // Determine if popular (hardcoded "Pro" as popular)
        if (product.name === 'Pro') {
          plan.isPopular = true
        }

        return plan
      })
      .filter((plan): plan is PricingPlan => plan !== null)

    // Sort by price (extract numeric value for sorting)
    return transformedPlans.sort((a, b) => {
      const getPriceValue = (priceStr: string) => {
        return parseFloat(priceStr.replace(/[$,]/g, '')) || 0
      }
      return (
        getPriceValue(a.displayPrice) - getPriceValue(b.displayPrice)
      )
    })
  }, [billing])

  // Early returns after all hooks
  if (!billing.loaded || !billing.loadBilling) {
    return null
  }

  if (billing.errors) {
    return null
  }

  const isPlanCurrent = (plan: PricingPlan): boolean => {
    if (
      !billing.currentSubscriptions ||
      billing.currentSubscriptions.length === 0
    ) {
      return false
    }
    const priceSlug = plan.slug
    const price = billing.getPrice(priceSlug)
    if (!price) return false
    const currentPriceIds = new Set(
      billing.currentSubscriptions
        .map((sub) => sub.priceId)
        .filter(
          (id): id is string =>
            typeof id === 'string' && id.length > 0
        )
    )
    return currentPriceIds.has(price.id)
  }

  const handleAdjustClick = (plan: PricingPlan, upgrade: boolean) => {
    setSelectedPlan(plan)
    setIsUpgrade(upgrade)
    setError(null)
  }

  const handleConfirm = async () => {
    if (!selectedPlan || !billing.adjustSubscription) return

    setIsLoading(true)
    setError(null)

    try {
      const result = await billing.adjustSubscription(
        selectedPlan.slug
      )

      // Check if there's realtime info for subscribing to billing run completion
      // The billingRunRealtime field is present when an immediate upgrade triggers a billing run
      const response = result as {
        resolvedTiming?:
          | 'immediately'
          | 'at_end_of_current_billing_period'
        billingRunRealtime?: BillingRunRealtimeInfo
      }

      if (
        response.resolvedTiming === 'immediately' &&
        response.billingRunRealtime
      ) {
        // Subscribe to billing run completion via trigger.dev realtime
        // The useBillingRunRealtime hook will handle reloading when complete
        setBillingRunRealtime(response.billingRunRealtime)
        // Keep isLoading true - it will be set to false when the run completes
      } else {
        // No billing run to wait for (downgrade or end-of-period adjustment)
        // Just reload and complete
        if (billing.reload) {
          await billing.reload()
        }
        setSelectedPlan(null)
        setIsLoading(false)
        onSuccess?.()
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : 'Failed to adjust subscription. Please try again.'
      setError(errorMsg)
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setSelectedPlan(null)
    setError(null)
  }

  // Format date for display (accepts string or number timestamp)
  const formatDate = (dateInput: string | number) => {
    const date = new Date(dateInput)
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  // Get the new plan price for display
  const getNewPlanPrice = () => {
    if (!selectedPlan) return null
    const price = billing.getPrice(selectedPlan.slug)
    return price?.unitPrice ?? 0
  }

  // Calculate prorated amount for upgrades (approximate)
  const calculateProratedAmount = () => {
    if (!selectedPlan || !billingPeriodEnd || !isUpgrade) return null

    const newPrice = getNewPlanPrice()
    if (newPrice === null) return null

    const priceDifference = newPrice - currentPlanPrice
    if (priceDifference <= 0) return 0

    // Calculate remaining days in billing period
    const now = new Date()
    const periodEnd = new Date(billingPeriodEnd)
    const msRemaining = periodEnd.getTime() - now.getTime()
    const daysRemaining = Math.max(
      0,
      Math.ceil(msRemaining / (1000 * 60 * 60 * 24))
    )

    // Approximate 30 days per month
    const prorationFactor = daysRemaining / 30
    return Math.round(priceDifference * prorationFactor)
  }

  const proratedAmount = calculateProratedAmount()

  // Helper function to get the confirm button text
  const getConfirmButtonText = () => {
    if (isLoading) return 'Processing...'
    return isUpgrade ? 'Confirm Upgrade' : 'Confirm Change'
  }

  return (
    <div className="w-full space-y-4">
      {plans.length === 0 ? (
        // Show skeleton cards when plans are loading
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="relative flex h-full flex-col">
              <CardHeader className="px-3 py-3 md:px-6 md:py-4">
                <Skeleton className="h-6 md:h-8 w-24 mb-2" />
                <Skeleton className="h-4 md:h-5 w-32 mb-2" />
                <div className="mt-1 md:mt-2">
                  <Skeleton className="h-8 md:h-10 w-20" />
                </div>
              </CardHeader>
              <CardFooter className="px-3 py-3 md:px-6 md:py-4 mt-auto">
                <Skeleton className="h-9 w-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((plan) => (
            <AdjustSubscriptionCard
              key={plan.name}
              plan={plan}
              isCurrentPlan={isPlanCurrent(plan)}
              currentPlanPrice={currentPlanPrice}
              billingPeriodEnd={billingPeriodEnd}
              hideFeatures={false}
              onAdjustClick={handleAdjustClick}
            />
          ))}
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog
        open={!!selectedPlan}
        onOpenChange={(open) => !open && handleCancel()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isUpgrade ? 'Confirm Upgrade' : 'Confirm Plan Change'}
            </DialogTitle>
            <DialogDescription>
              {isUpgrade ? (
                <>
                  You are upgrading to{' '}
                  <strong>{selectedPlan?.name}</strong> at{' '}
                  <strong>{selectedPlan?.displayPrice}/month</strong>.
                </>
              ) : (
                <>
                  You are switching to{' '}
                  <strong>{selectedPlan?.name}</strong> at{' '}
                  <strong>{selectedPlan?.displayPrice}/month</strong>.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {isUpgrade ? (
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Timing
                  </span>
                  <span className="font-medium">Immediate</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Prorated charge
                  </span>
                  <span className="font-medium">
                    {proratedAmount !== null
                      ? `~$${(proratedAmount / 100).toFixed(2)}`
                      : 'Calculated at checkout'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  You will be charged a prorated amount for the
                  remainder of your billing period. Your new plan
                  features will be available immediately.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Timing
                  </span>
                  <span className="font-medium">
                    {billingPeriodEnd
                      ? `Starts ${formatDate(billingPeriodEnd)}`
                      : 'End of billing period'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Amount due today
                  </span>
                  <span className="font-medium">$0.00</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Your current plan will remain active until the end
                  of your billing period. The new plan will start
                  automatically after that.
                </p>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive text-center">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={isLoading}>
              {getConfirmButtonText()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
