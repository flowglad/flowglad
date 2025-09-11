'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  SubscriptionCheckoutDetails,
  useCheckoutPageContext,
} from '@/contexts/checkoutPageContext'
import { CheckoutFlowType, CurrencyCode, PriceType } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { Purchase } from '@/db/schema/purchases'
import { sentenceCase } from 'change-case'
import Image from 'next/image'
import { CheckoutMarkdownView } from '@/components/ui/checkout-markdown-view'
import { Price } from '@/db/schema/prices'

export interface BillingHeaderProps
  extends React.HTMLAttributes<HTMLDivElement> {}

export const intervalLabel = (
  purchase: Pick<
    Purchase.SubscriptionPurchaseRecord,
    'intervalCount' | 'intervalUnit'
  >
) => {
  const intervalCount = purchase?.intervalCount ?? 1
  const intervalUnit = purchase?.intervalUnit ?? 'month'
  const intervalLabel =
    intervalCount > 1
      ? `${intervalCount} ${intervalUnit}s`
      : intervalUnit.slice(0, -1) + 'ly'
  return intervalLabel
}

export const pricingSubtitleForSubscriptionFlow = (
  checkoutContext: ReturnType<typeof useCheckoutPageContext>
) => {
  // Use type assertion since we know these properties exist for subscription flows
  const { purchase, price, product, checkoutSession } =
    checkoutContext as any

  if (!purchase || !price || !product || !checkoutSession) {
    return ''
  }

  const priceSubtitle =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      price.currency,
      price.unitPrice
    )
  const intervalLabelText = intervalLabel(purchase)

  const quantitySubtitle =
    checkoutSession.quantity > 1
      ? `${checkoutSession.quantity} × `
      : ''

  return `${quantitySubtitle}${priceSubtitle}/${intervalLabelText}`
}

const pricingSubtitleForSinglePaymentFlow = (
  purchase: Purchase.SinglePaymentPurchaseRecord,
  price: Pick<Price.ClientRecord, 'unitPrice' | 'currency'>
) => {
  return stripeCurrencyAmountToHumanReadableCurrencyAmount(
    price.currency,
    purchase?.firstInvoiceValue ?? price.unitPrice
  )
}

export const BillingHeader = React.forwardRef<
  HTMLDivElement,
  BillingHeaderProps
>(({ className, ...props }, ref) => {
  const checkoutPageContext = useCheckoutPageContext()

  if (
    checkoutPageContext.flowType === CheckoutFlowType.Invoice ||
    checkoutPageContext.flowType === CheckoutFlowType.AddPaymentMethod
  ) {
    return null
  }

  const {
    purchase,
    price,
    product,
    subscriptionDetails,
    flowType,
    checkoutSession,
  } = checkoutPageContext
  let mainTitleSuffix = ''
  if (price.type === PriceType.SinglePayment) {
    mainTitleSuffix = `${stripeCurrencyAmountToHumanReadableCurrencyAmount(
      price.currency,
      purchase?.firstInvoiceValue == null
        ? price.unitPrice * checkoutSession.quantity
        : purchase.firstInvoiceValue
    )}`
  } else if (flowType === CheckoutFlowType.Subscription) {
    mainTitleSuffix = pricingSubtitleForSubscriptionFlow(
      checkoutPageContext
    )
  }

  return (
    <div
      ref={ref}
      className={cn('flex flex-col gap-4', className)} // Better spacing
      {...props}
    >
      {/* Product Title & Price Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h1
            className={cn(
              'text-[24px] font-medium leading-[32px]', // LS typography
              'text-foreground dark:text-white', // Adaptive color
              'mb-1'
            )}
          >
            {product.name}
          </h1>
          {mainTitleSuffix && (
            <p className="text-[20px] leading-[30px] text-muted-foreground dark:text-gray-400">
              {mainTitleSuffix}
            </p>
          )}
        </div>
      </div>

      {/* Product Description */}
      {product.description && (
        <div
          className={cn(
            'text-[14px] leading-[24px]', // LS typography
            'text-foreground dark:text-[#cccccc]', // LS description color
            'space-y-4'
          )}
        >
          <CheckoutMarkdownView
            data-testid="product-description"
            source={product.description}
          />
        </div>
      )}
    </div>
  )
})

BillingHeader.displayName = 'BillingHeader'
