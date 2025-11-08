'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { useBilling } from '@flowglad/react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PricingPlan {
  name: string;
  description?: string;
  displayMonthly: string;
  displayYearly: string;
  monthlySlug: string;
  yearlySlug: string;
  features: string[];
  isPopular?: boolean;
}

interface PricingCardProps {
  plan: PricingPlan;
  billingPeriod: 'monthly' | 'yearly';
  isCurrentPlan?: boolean;
  hideFeatures?: boolean;
}

/**
 * PricingCard component displays a single pricing plan
 */
export function PricingCard({
  plan,
  billingPeriod,
  isCurrentPlan = false,
  hideFeatures = false,
}: PricingCardProps) {
  const billing = useBilling();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const periodLabel = billingPeriod === 'monthly' ? '/month' : '/year';
  const priceSlug =
    billingPeriod === 'monthly' ? plan.monthlySlug : plan.yearlySlug;
  const displayPrice =
    billingPeriod === 'monthly' ? plan.displayMonthly : plan.displayYearly;

  // Check if this plan is a default plan by checking the catalog
  const isDefaultPlan = (() => {
    if (!billing.catalog?.products || !priceSlug) return false;

    for (const product of billing.catalog.products) {
      const price = product.prices?.find(
        (p) => 'slug' in p && p.slug === priceSlug
      );
      if (price) {
        // Check if the product is default (e.g., Free Plan)
        return product.default === true;
      }
    }
    return false;
  })();

  // Calculate monthly equivalent from yearly price for subtext
  const calculateMonthlyEquivalent = (yearlyPrice: string): string => {
    // Remove $ and commas, parse as number
    const numericPrice = parseFloat(yearlyPrice.replace(/[$,]/g, ''));
    if (isNaN(numericPrice)) return yearlyPrice;
    // Divide by 12 and format back
    const monthlyEquivalent = numericPrice / 12;
    return `$${Math.round(monthlyEquivalent)}`;
  };

  const handleCheckout = async () => {
    setError(null);

    // Check if billing is loaded
    if (!billing.loaded) {
      const errorMsg =
        'Billing system not loaded yet. Please wait a moment and try again.';
      setError(errorMsg);
      return;
    }

    if (!billing.createCheckoutSession || !billing.getPrice) {
      const errorMsg = 'Billing system not available. Please refresh the page.';
      setError(errorMsg);
      return;
    }

    // Get price object from slug to get the price ID
    const priceObj = billing.getPrice(priceSlug);
    if (!priceObj) {
      const errorMsg = `Price not found for "${priceSlug}". Please contact support.`;
      setError(errorMsg);
      return;
    }

    setIsLoading(true);
    try {
      await billing.createCheckoutSession({
        priceId: priceObj.id,
        successUrl: `${window.location.origin}/`,
        cancelUrl: window.location.href,
        quantity: 1,
        autoRedirect: true,
        type: 'product',
      });
    } catch (error) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : 'Failed to start checkout. Please try again.';
      setError(errorMsg);
      setIsLoading(false);
    }
  };

  return (
    <Card
      className={cn(
        'relative flex h-full flex-col',
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
        <CardTitle className="text-lg md:text-2xl">{plan.name}</CardTitle>
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
              {periodLabel}
            </span>
          </div>
          {billingPeriod === 'yearly' && !isDefaultPlan && (
            <p className="text-muted-foreground mt-0.5 text-xs">
              {calculateMonthlyEquivalent(plan.displayYearly)}/month billed
              annually
            </p>
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
                <li key={feature} className="flex items-start gap-1.5 md:gap-2">
                  <Check className="mt-0.5 h-3 w-3 md:h-4 md:w-4 shrink-0 text-primary" />
                  <span className="text-xs md:text-sm">{feature}</span>
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
            <p className="text-xs text-destructive text-center">{error}</p>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
