'use client'
import { CheckoutInfoCore } from '@/db/tableMethods/purchaseMethods'
import CheckoutForm from '@/components/CheckoutForm'
import { CheckoutDetails } from '@/components/checkout/checkout-details'
import CheckoutPageProvider from '@/contexts/checkoutPageContext'
import { trpc } from '@/app/_trpc/client'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import core from '@/utils/core'
import { CheckoutFlowType } from '@/types'
import { useSetCheckoutSessionCookieEffect } from '@/app/hooks/useSetCheckoutSessionCookieEffect'

const CheckoutPage = ({
  checkoutInfo,
}: {
  checkoutInfo: CheckoutInfoCore
}) => {
  if (checkoutInfo.flowType === CheckoutFlowType.Invoice) {
    throw Error(
      'Invoice checkout flow cannot be rendered as a Checkout Page'
    )
  }
  useSetCheckoutSessionCookieEffect(checkoutInfo)

  /** Outer wrapper for centering on ultra-wide displays */
  const outerWrapper = cn(
    'min-h-screen w-full relative',
    'flex items-center justify-center', // Center the entire checkout
    'bg-background sm:bg-transparent' // Background for mobile only
  )

  /** Full-width background for left side - extends to viewport edge */
  const fullWidthLeftBackground = cn(
    'fixed top-0 left-0 bottom-0',
    'w-1/2 sm:w-[50vw]', // Half viewport width from 640px+
    'bg-muted dark:bg-[#141414]', // Match existing left color
    '-z-20',
    'hidden sm:block' // Show from 640px+
  )

  /** Full-width background for right side - extends to viewport edge */
  const fullWidthRightBackground = cn(
    'fixed top-0 right-0 bottom-0',
    'w-1/2 sm:w-[50vw]', // Half viewport width from 640px+
    'bg-white', // Always white
    '-z-20',
    'hidden sm:block' // Show from 640px+
  )

  /** Main container with max-width constraint */
  const checkoutContainer = cn(
    'relative w-full max-w-[1068px]', // Max width of 1068px (534px + 534px)
    'min-h-screen',
    'flex flex-col sm:flex-row', // Stack below 640px, side-by-side from 640px+
    'mx-auto z-10' // Center horizontally, above backgrounds
  )

  /** Product section (left side) */
  const productSectionContainer = cn(
    'w-full sm:w-[50%] lg:w-[534px]', // Full width mobile, 50% from 640px, 534px from 1024px+
    'bg-muted dark:bg-[#141414]', // Adaptive dark background
    'sm:min-h-screen', // Full height from 640px+
    'sm:border-r border-muted', // Right border from 640px+ with 80% opacity
    'px-4 sm:px-8 md:px-12 lg:px-20', // 16px mobile, 32px small, 48px medium, 80px desktop+
    'pt-12 sm:pt-12 lg:pt-16', // 48px mobile, 120px desktop
    'pb-12 sm:pb-0 lg:pb-[643.55px]', // Bottom padding only on mobile and desktop
    'flex flex-col'
  )

  /** Form section (right side) */
  const formSectionContainer = cn(
    'w-full sm:w-[50%] lg:w-[534px]', // Full width mobile, 50% from 640px, 534px from 1024px+
    'bg-white', // Always pure white background
    'sm:min-h-screen', // Full height from 640px+
    'sm:shadow-[-20px_0_24px_rgba(0,0,0,0.06)]', // Left-adjusted shadow from 640px+
    'px-4 sm:px-8 md:px-12 lg:px-20', // 16px mobile, 32px small, 48px medium, 80px desktop+
    'pt-12 sm:pt-12 lg:pt-16', // Match product section
    'pb-20', // Bottom padding
    'flex flex-col'
  )

  return (
    <CheckoutPageProvider values={checkoutInfo}>
      {/* Full-width backgrounds that extend to viewport edges */}
      <div className={fullWidthLeftBackground} />
      <div className={fullWidthRightBackground} />

      <div className={outerWrapper}>
        <div className={checkoutContainer}>
          {/* Product Details Section */}
          <div className={productSectionContainer}>
            <div className="w-full">
              <CheckoutDetails />
            </div>
          </div>

          {/* Payment Form Section */}
          <div className={formSectionContainer}>
            <div className="w-full">
              <CheckoutForm />
            </div>
          </div>
        </div>
      </div>
    </CheckoutPageProvider>
  )
}

export default CheckoutPage
