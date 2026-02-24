'use client'

import { usePricingModel, useSubscriptions } from '@flowglad/nextjs'
import Autoplay from 'embla-carousel-autoplay'
import { useMemo, useRef } from 'react'
import type { PricingPlan } from '@/components/pricing-card'
import { PricingCard } from '@/components/pricing-card'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import { Skeleton } from '@/components/ui/skeleton'
import { useMobile } from '@/hooks/use-mobile'
import { transformProductsToPricingPlans } from '@/lib/billing-helpers'

/**
 * PricingCardsGrid component displays all pricing plans in a responsive grid or carousel
 */
export function PricingCardsGrid() {
  const isMobile = useMobile()
  const autoplayPlugin = useRef(
    Autoplay({
      delay: 3000,
      stopOnInteraction: true,
    })
  )
  const pricingModel = usePricingModel()
  const { currentSubscriptions } = useSubscriptions()

  // Build plans from pricingModel using shared utility
  const plans = useMemo<PricingPlan[]>(() => {
    if (!pricingModel) {
      return []
    }

    return transformProductsToPricingPlans(pricingModel)
  }, [pricingModel])

  const isLoading =
    pricingModel === null || pricingModel === undefined

  // Show loading skeleton when pricing model is still loading
  if (isLoading) {
    return (
      <div className="w-full space-y-8">
        {isMobile ? (
          <div className="px-4">
            <Carousel
              plugins={[autoplayPlugin.current]}
              className="w-full"
              opts={{
                align: 'start',
                loop: true,
              }}
            >
              <CarouselContent className="-ml-1">
                {[1, 2].map((i) => (
                  <CarouselItem key={i} className="pl-1 basis-1/2">
                    <div className="p-1 h-full">
                      <Card className="relative flex h-full flex-col">
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
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          </div>
        ) : (
          <div className="grid gap-6 auto-rows-fr md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="relative flex h-full flex-col">
                <CardHeader className="px-3 py-3 md:px-6 md:py-4">
                  <Skeleton className="h-6 md:h-8 w-24 mb-2" />
                  <Skeleton className="h-4 md:h-5 w-32 mb-2" />
                  <div className="mt-1 md:mt-2">
                    <Skeleton className="h-8 md:h-10 w-20" />
                  </div>
                </CardHeader>
                <CardContent className="flex-1 px-3 md:px-6 pt-0">
                  <ul className="space-y-1.5 md:space-y-3">
                    {[1, 2, 3, 4].map((j) => (
                      <li
                        key={j}
                        className="flex items-start gap-1.5 md:gap-2"
                      >
                        <Skeleton className="h-3 w-3 md:h-4 md:w-4 mt-0.5 shrink-0 rounded-full" />
                        <Skeleton className="h-3 md:h-4 flex-1" />
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="px-3 py-3 md:px-6 md:py-4 mt-auto">
                  <Skeleton className="h-9 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    )
  }

  const isPlanCurrent = (plan: PricingPlan): boolean => {
    if (!currentSubscriptions || currentSubscriptions.length === 0) {
      return false
    }
    const priceSlug = plan.slug
    // Look up price by slug in pricingModel
    let priceId: string | null = null
    for (const product of pricingModel.products) {
      const found = product.prices?.find((p) => p.slug === priceSlug)
      if (found) {
        priceId = found.id
        break
      }
    }
    if (!priceId) return false
    const currentPriceIds = new Set(
      currentSubscriptions
        .map((sub) => sub.priceId)
        .filter(
          (id): id is string =>
            typeof id === 'string' && id.length > 0
        )
    )
    return currentPriceIds.has(priceId)
  }

  // Empty state: pricing model loaded but no plans
  if (plans.length === 0) {
    return (
      <div className="w-full space-y-8">
        <p className="text-center text-sm text-muted-foreground">
          No pricing plans available.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-8">
      {/* Pricing Cards - Carousel on Mobile, Grid on Desktop */}
      {isMobile ? (
        <div className="px-4">
          <Carousel
            plugins={[autoplayPlugin.current]}
            className="w-full"
            opts={{
              align: 'start',
              loop: true,
            }}
          >
            <CarouselContent className="-ml-1">
              {plans.map((plan) => (
                <CarouselItem
                  key={plan.name}
                  className="pl-1 basis-1/2"
                >
                  <div className="p-1 h-full">
                    <PricingCard
                      plan={plan}
                      isCurrentPlan={isPlanCurrent(plan)}
                      hideFeatures={true}
                    />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
          </Carousel>
        </div>
      ) : (
        <div className="grid gap-6 auto-rows-fr md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <PricingCard
              key={plan.name}
              plan={plan}
              isCurrentPlan={isPlanCurrent(plan)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
