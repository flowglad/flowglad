'use client';

import LogoCloud from '@/components/ui/LogoCloud';
import { User } from '@supabase/supabase-js';
import { useBilling } from '@flowglad/nextjs';
import { SubscriptionDemoCard } from '../SubscriptionCardDemo';
import { PricingTable } from '@flowglad/react';

interface Props {
  user: User | null | undefined;
}

export default function Pricing({ user }: Props) {
  const billing = useBilling();
  if (!billing.loaded) {
    return (
      <section className="bg-black">
        <div className="max-w-6xl px-4 py-8 mx-auto sm:py-24 sm:px-6 lg:px-8">
          <div className="sm:flex sm:flex-col sm:align-center"></div>
        </div>
      </section>
    );
  } else if (billing.errors) {
    return (
      <section className="bg-black">
        <div className="max-w-6xl px-4 py-8 mx-auto sm:py-24 sm:px-6 lg:px-8">
          <div className="sm:flex sm:flex-col sm:align-center"></div>
        </div>
      </section>
    );
  }

  const products = billing.catalog.products.map((item) => {
    return {
      ...item.product,
      primaryButtonText: 'Subscribe',
      displayFeatures: [
        {
          details: '100% Satisfaction Guarantee',
          label: 'Satisfaction Guarantee',
          enabled: true
        },
        {
          details: 'Cancel anytime',
          label: 'Cancel anytime',
          enabled: true
        },
        {
          details: 'No hidden fees',
          label: 'No hidden fees',
          enabled: true
        },
        {
          details: 'Free trial',
          label: 'Free trial',
          enabled: true
        }
      ],
      prices: item.prices.map((price) => {
        return {
          ...price,
          currency: 'USD' as const
        };
      })
    };
  });
  return (
    <section className="bg-black">
      <div className="max-w-6xl px-4 py-8 mx-auto sm:py-24 sm:px-6 lg:px-8">
        <div className="sm:flex sm:flex-col sm:align-center"></div>
        <PricingTable products={[products, products, products].flat()} />
      </div>
      <SubscriptionDemoCard />
      <LogoCloud />
    </section>
  );
}
