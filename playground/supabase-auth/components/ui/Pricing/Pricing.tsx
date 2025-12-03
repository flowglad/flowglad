'use client'

import { useBilling } from '@flowglad/nextjs'
import type { User } from '@supabase/supabase-js'
import LogoCloud from '@/components/ui/LogoCloud'
import {
  AddPaymentMethodButton,
  SubscribeButton,
  SubscriptionDemoCard,
} from '../SubscriptionCardDemo'

interface Props {
  user: User | null | undefined
}

export default function Pricing({ user }: Props) {
  const billing = useBilling()
  if (!billing.loaded) {
    return (
      <section className="bg-black">
        <div className="max-w-6xl px-4 py-8 mx-auto sm:py-24 sm:px-6 lg:px-8">
          <div className="sm:flex sm:flex-col sm:align-center"></div>
        </div>
      </section>
    )
  } else if (billing.errors) {
    return (
      <section className="bg-black">
        <div className="max-w-6xl px-4 py-8 mx-auto sm:py-24 sm:px-6 lg:px-8">
          <div className="sm:flex sm:flex-col sm:align-center"></div>
        </div>
      </section>
    )
  }
  if (!billing.createAddPaymentMethodCheckoutSession) {
    return <div>Loading...</div>
  }
  const products = billing.catalog?.products.map((item) => {
    return {
      ...item,
      primaryButtonText: 'Subscribe',
      prices: item.prices.map((price) => {
        return {
          ...price,
          currency: 'USD' as const,
        }
      }),
    }
  })
  return (
    <section className="bg-black">
      <div className="max-w-6xl px-4 py-8 mx-auto sm:py-24 sm:px-6 lg:px-8">
        <div className="sm:flex sm:flex-col sm:align-center"></div>
        <SubscribeButton />
        <SubscribeButton usePriceSlug={true} />
        <AddPaymentMethodButton />
      </div>
      <SubscriptionDemoCard />
      <LogoCloud />
    </section>
  )
}
