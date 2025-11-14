'use client';

import { useRef, useMemo } from 'react';
import Autoplay from 'embla-carousel-autoplay';
import { PricingCard } from '@/components/pricing-card';
import type { PricingPlan } from '@/components/pricing-card';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { useMobile } from '@/hooks/use-mobile';
import { useBilling } from '@flowglad/nextjs';
import { Skeleton } from '@/components/ui/skeleton';
import type { SubscriptionPrice } from '@flowglad/types';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';

/**
 * PricingCardsGrid component displays all pricing plans in a responsive grid or carousel
 */
export function PricingCardsGrid() {
  const isMobile = useMobile();
  const autoplayPlugin = useRef(
    Autoplay({
      delay: 3000,
      stopOnInteraction: true,
    })
  );
  const billing = useBilling();

  // Build plans from pricingModel based on current billing period
  const plans = useMemo<PricingPlan[]>(() => {
    if (
      !billing.loaded ||
      billing.loadBilling !== true ||
      billing.errors !== null ||
      !billing.pricingModel?.products
    ) {
      return [];
    }

    const { products } = billing.pricingModel;

    // Filter products: subscription type, monthly interval, active
    // Now includes free/default plans
    const filteredProducts = products.filter((product) => {
      // Find subscription price with monthly interval
      const matchingPrice = product.prices?.find(
        (price): price is SubscriptionPrice =>
          price.type === 'subscription' &&
          price.active === true &&
          price.intervalUnit === 'month'
      );

      return !!matchingPrice;
    });

    // Transform products to PricingPlan format
    const transformedPlans = filteredProducts
      .map((product) => {
        // Always use monthly pricing
        const price = product.prices?.find(
          (p): p is SubscriptionPrice =>
            p.type === 'subscription' &&
            p.active === true &&
            p.intervalUnit === 'month'
        );

        if (!price || !price.slug) return null;

        // Format price from cents to display string
        const formatPrice = (cents: number): string => {
          if (cents === 0) return 'Free';
          const dollars = cents / 100;
          return `$${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
        };

        // Build features list from feature objects (features have name and description)
        const featureNames =
          product.features
            ?.map((feature) => feature.name ?? '')
            .filter(
              (name): name is string =>
                typeof name === 'string' && name.length > 0
            ) ?? [];

        const plan: PricingPlan = {
          name: product.name,
          displayPrice: formatPrice(price.unitPrice),
          slug: price.slug,
          features: featureNames,
        };

        if (product.description) {
          plan.description = product.description;
        }

        // Determine if popular (hardcoded "Pro" as popular)
        if (product.name === 'Pro') {
          plan.isPopular = true;
        }

        return plan;
      })
      .filter((plan): plan is PricingPlan => plan !== null);

    // Sort by price (extract numeric value for sorting)
    // Free plan should come first, then by price
    return transformedPlans.sort((a, b) => {
      const getPriceValue = (priceStr: string) => {
        if (priceStr === 'Free') return -1; // Free comes first
        return parseFloat(priceStr.replace(/[$,]/g, '')) || 0;
      };
      const aValue = getPriceValue(a.displayPrice);
      const bValue = getPriceValue(b.displayPrice);
      if (aValue === -1) return -1; // Free always first
      if (bValue === -1) return 1; // Free always first
      return aValue - bValue;
    });
  }, [
    billing.loaded,
    billing.loadBilling,
    billing.errors,
    billing.loaded && billing.loadBilling === true && billing.errors === null
      ? billing.pricingModel
      : null,
  ]);

  const isPlanCurrent = (plan: PricingPlan): boolean => {
    if (
      !billing.loaded ||
      billing.loadBilling !== true ||
      billing.errors !== null ||
      typeof billing.getPrice !== 'function' ||
      !Array.isArray(billing.currentSubscriptions)
    ) {
      return false;
    }
    const price = billing.getPrice(plan.slug);
    if (!price) return false;
    const currentPriceIds = new Set(
      billing.currentSubscriptions
        .map((sub) => sub.priceId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );
    return currentPriceIds.has(price.id);
  };

  // Check if user is on a premium plan (not free)
  const currentSubscription = billing.currentSubscriptions?.[0];
  const isFreePlan = currentSubscription?.isFreePlan ?? false;
  const isPremiumPlan = !!(currentSubscription && !isFreePlan);

  return (
    <div className="w-full space-y-8">
      {/* Pricing Cards - Carousel on Mobile, Grid on Desktop */}
      {plans.length === 0 ? (
        // Show skeleton cards when plans are loading
        isMobile ? (
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
                    {[1, 2, 3].map((j) => (
                      <li key={j} className="flex items-start gap-1.5 md:gap-2">
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
        )
      ) : isMobile ? (
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
                <CarouselItem key={plan.name} className="pl-1 basis-1/2">
                  <div className="p-1 h-full">
                    <PricingCard
                      plan={plan}
                      isCurrentPlan={isPlanCurrent(plan)}
                      hideFeatures={true}
                      isPremiumUser={isPremiumPlan}
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
              isPremiumUser={isPremiumPlan}
            />
          ))}
        </div>
      )}
    </div>
  );
}
