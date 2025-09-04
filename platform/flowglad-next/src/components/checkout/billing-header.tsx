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
import CheckoutMarkdownView from '@/components/ion/CheckoutMarkdownView'
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
      className={cn('flex flex-col justify-center', className)}
      {...props}
    >
      <div className="bg-card w-full flex justify-center rounded-lg px-6 py-4 relative border border-border shadow">
        <div className="w-full flex flex-col items-center gap-4">
          <div className="text-2xl font-medium text-foreground w-full text-center">
            {product.name}
          </div>
          <div className="text-lg text-muted-foreground text-center w-full">
            {mainTitleSuffix}
          </div>
          {product.description && (
            <div className="w-full">
              <CheckoutMarkdownView
                data-testid="product-description"
                source={product.description}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

BillingHeader.displayName = 'BillingHeader'
