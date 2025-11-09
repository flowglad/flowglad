'use client';

import { useState, useRef } from 'react';
import Autoplay from 'embla-carousel-autoplay';
import { PricingCard } from '@/components/pricing-card';
import type { PricingPlan } from '@/components/pricing-card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { useMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useBilling } from '@flowglad/nextjs';

const plans: PricingPlan[] = [
  {
    name: 'Basic',
    description: '~200 fast generations',
    displayMonthly: '$10',
    displayYearly: '$96',
    monthlySlug: 'basic_monthly',
    yearlySlug: 'basic_yearly',
    features: [
      '200 Fast Generations',
      'General Commercial Terms',
      'Optional Credit Top Ups',
      'Use Within Upgraded Images',
    ],
  },
  {
    name: 'Standard',
    description: '360 fast generations + 30 min HD video',
    displayMonthly: '$30',
    displayYearly: '$288',
    monthlySlug: 'standard_monthly',
    yearlySlug: 'standard_yearly',
    features: [
      '360 Fast Generations',
      '30 HD Video Minutes',
      'General Commercial Terms',
      'Optional Credit Top Ups',
      'Unlimited Relaxed Image Generations',
      'Use Within Upgraded Images',
    ],
  },
  {
    name: 'Pro',
    description: '750 fast generations + 60 min HD video + Stealth',
    displayMonthly: '$60',
    displayYearly: '$576',
    monthlySlug: 'pro_monthly',
    yearlySlug: 'pro_yearly',
    features: [
      '750 Fast Generations',
      '60 HD Video Minutes',
      'General Commercial Terms',
      'Optional Credit Top Ups',
      'Unlimited Relaxed Image Generations',
      'Unlimited Relaxed SD Video',
      'Stealth Mode',
      'Use Within Upgraded Images',
    ],
    isPopular: true,
  },
  {
    name: 'Mega',
    description: '900+ fast generations + 120 min HD video + Stealth',
    displayMonthly: '$120',
    displayYearly: '$1,152',
    monthlySlug: 'mega_monthly',
    yearlySlug: 'mega_yearly',
    features: [
      '900+ Fast Generations',
      '120 HD Video Minutes',
      'General Commercial Terms',
      'Optional Credit Top Ups',
      'Unlimited Relaxed Image Generations',
      'Unlimited Relaxed SD Video',
      'Stealth Mode',
      'Use Within Upgraded Images',
    ],
  },
];

/**
 * PricingCardsGrid component displays all pricing plans in a responsive grid or carousel
 */
export function PricingCardsGrid() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>(
    'monthly'
  );
  const isYearly = billingPeriod === 'yearly';
  const isMobile = useMobile();
  const autoplayPlugin = useRef(
    Autoplay({
      delay: 3000,
      stopOnInteraction: true,
    })
  );
  const billing = useBilling();

  const isPlanCurrent = (plan: PricingPlan): boolean => {
    if (
      !billing.loaded ||
      !('getPrice' in billing) ||
      !billing.getPrice ||
      !Array.isArray(billing.currentSubscriptions)
    ) {
      return false;
    }
    const priceSlug = isYearly ? plan.yearlySlug : plan.monthlySlug;
    const price = billing.getPrice(priceSlug);
    if (!price) return false;
    const currentPriceIds = new Set(
      billing.currentSubscriptions
        .map((sub) => (sub as { priceId?: string }).priceId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );
    return currentPriceIds.has(price.id);
  };

  return (
    <div className="w-full space-y-8">
      {/* Billing Period Toggle */}
      <div className="grid grid-cols-3 grid-rows-2 items-center justify-center gap-x-1 gap-y-1 w-fit mx-auto">
        {/* Row 1 */}
        <div className="flex items-center justify-center">
          <span
            className={cn(
              'text-sm font-medium transition-colors',
              !isYearly ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            Monthly
          </span>
        </div>
        <div className="flex items-center justify-center">
          <Switch
            checked={isYearly}
            onCheckedChange={(checked) =>
              setBillingPeriod(checked ? 'yearly' : 'monthly')
            }
          />
        </div>
        <div className="flex items-center justify-center">
          <span
            className={cn(
              'text-sm font-medium transition-colors',
              isYearly ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            Yearly
          </span>
        </div>
        {/* Row 2 */}
        <div></div>
        <div></div>
        <div className="flex items-center justify-center">
          <Badge variant="secondary" className="text-xs">
            Save 20%
          </Badge>
        </div>
      </div>

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
                <CarouselItem key={plan.name} className="pl-1 basis-1/2">
                  <div className="p-1 h-full">
                    <PricingCard
                      plan={plan}
                      billingPeriod={billingPeriod}
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
              billingPeriod={billingPeriod}
              isCurrentPlan={isPlanCurrent(plan)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
