'use client';

import LogoCloud from '@/components/ui/LogoCloud';
import { User } from '@supabase/supabase-js';
import { useBilling } from '@flowglad/nextjs';
import { SubscriptionDemoCard, SubscribeButton } from '../SubscriptionCardDemo';
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

  const products = billing.catalog?.products.map((item) => {
    return {
      ...item,
      primaryButtonText: 'Subscribe',
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
        <SubscribeButton />
      </div>
      <SubscriptionDemoCard />
      <LogoCloud />
    </section>
  );
}
