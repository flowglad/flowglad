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

  // Build plans from pricingModel
  const plans = useMemo<PricingPlan[]>(() => {
    // Early return if billing isn't ready or has no pricing model
    if (
      !billing.loaded ||
      !billing.loadBilling ||
      billing.errors ||
      !billing.pricingModel
    ) {
      return [];
    }

    const { products } = billing.pricingModel;

    // Filter products: subscription type, active, not default/free
    const filteredProducts = products.filter((product) => {
      // Skip default/free products
      if (product.default === true) return false;

      // Find active subscription price
      const matchingPrice = product.prices.find(
        (price) => price.type === 'subscription' && price.active === true
      );

      return !!matchingPrice;
    });

    // Transform products to PricingPlan format
    const transformedPlans = filteredProducts
      .map((product) => {
        const price = product.prices.find(
          (p) => p.type === 'subscription' && p.active === true
        );

        if (!price || !price.slug) return null;

        // Format price from cents to display string
        const formatPrice = (cents: number): string => {
          const dollars = cents / 100;
          return `$${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
        };

        const displayPrice = formatPrice(price.unitPrice);

        // Build features list from feature objects (features have name and description)
        const featureNames =
          product.features
            .map((feature) => feature.name)
            .filter(
              (name): name is string =>
                typeof name === 'string' && name.length > 0
            ) ?? [];

        const plan: PricingPlan = {
          name: product.name,
          displayPrice: displayPrice,
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
    return transformedPlans.sort((a, b) => {
      const getPriceValue = (priceStr: string) => {
        return parseFloat(priceStr.replace(/[$,]/g, '')) || 0;
      };
      return getPriceValue(a.displayPrice) - getPriceValue(b.displayPrice);
    });
  }, [billing]);

  // Early returns after all hooks to prevent type issues in the rest of the component
  if (!billing.loaded || !billing.loadBilling) {
    return null; // or loading skeleton
  }

  if (billing.errors) {
    return null; // or error message
  }

  const isPlanCurrent = (plan: PricingPlan): boolean => {
    if (
      !billing.currentSubscriptions ||
      billing.currentSubscriptions.length === 0
    ) {
      return false;
    }
    const priceSlug = plan.slug;
    const price = billing.getPrice(priceSlug);
    if (!price) return false;
    const currentPriceIds = new Set(
      billing.currentSubscriptions
        .map((sub) => sub.priceId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );
    return currentPriceIds.has(price.id);
  };

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
                    {[1, 2, 3, 4].map((j) => (
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
  );
}
