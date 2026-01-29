'use client'

<<<<<<< HEAD
import { CurrencyCode, PriceType } from '@db-core/enums'
||||||| parent of b097e5ae (Delete original src/db schema utils and update all imports to @db-core)
=======
>>>>>>> b097e5ae (Delete original src/db schema utils and update all imports to @db-core)
import { encodeCursor } from '@db-core/tableUtils'
import { sentenceCase } from 'change-case'
import { Check } from 'lucide-react'
import Image from 'next/image'
import * as React from 'react'
import { trpc } from '@/app/_trpc/client'
import { CheckoutMarkdownView } from '@/components/ui/checkout-markdown-view'
import {
  SubscriptionCheckoutDetails,
  useCheckoutPageContext,
} from '@/contexts/checkoutPageContext'
import type { Price } from '@/db/schema/prices'
import type { Purchase } from '@/db/schema/purchases'
import { cn } from '@/lib/utils'
import { CheckoutFlowType } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

export interface BillingHeaderProps
  extends React.HTMLAttributes<HTMLDivElement> {}

export const intervalLabel = (
  purchase:
    | Pick<
        Purchase.SubscriptionPurchaseRecord,
        'intervalCount' | 'intervalUnit'
      >
    | null
    | undefined,
  price?: Pick<
    Price.SubscriptionRecord,
    'intervalCount' | 'intervalUnit'
  >
) => {
  const intervalCount =
    purchase?.intervalCount ?? price?.intervalCount ?? 1
  const intervalUnit =
    purchase?.intervalUnit ?? price?.intervalUnit ?? 'month'

  const intervalLabel =
    intervalCount > 1
      ? `${intervalCount} ${intervalUnit}s`
      : intervalUnit !== 'day'
        ? intervalUnit + 'ly'
        : 'daily'
  return intervalLabel
}

export const pricingSubtitleForSubscriptionFlow = (
  checkoutContext: ReturnType<typeof useCheckoutPageContext>
) => {
  // Use type assertion since we know these properties exist for subscription flows
  const { purchase, price, product, checkoutSession } =
    checkoutContext as any

  if (!purchase && !price && !product && !checkoutSession) {
    return ''
  }

  const priceSubtitle =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      price.currency,
      price.unitPrice
    )
  const intervalLabelText = intervalLabel(purchase, price)

  const quantitySubtitle =
    checkoutSession.quantity > 1
      ? `${checkoutSession.quantity} × `
      : ''

  return `${quantitySubtitle}${priceSubtitle} ${intervalLabelText}`
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
    flowType,
    checkoutSession,
    features,
  } = checkoutPageContext
  let mainTitleSuffix = ''
  if (price.type === PriceType.SinglePayment) {
    mainTitleSuffix = `${stripeCurrencyAmountToHumanReadableCurrencyAmount(
      price.currency,
      purchase?.firstInvoiceValue == null
        ? price.unitPrice * checkoutSession.quantity
        : purchase.firstInvoiceValue
    )}`
  } else if (
    flowType === CheckoutFlowType.Subscription ||
    price.type === PriceType.Subscription
  ) {
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
      <div className="flex flex-col gap-2">
        <h1
          className={cn(
            'text-[24px] font-medium leading-[32px]', // LS typography
            'text-foreground dark:text-white' // Adaptive color
          )}
          style={{
            fontFamily:
              'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
          data-testid="checkout-product-name"
        >
          <span>{product.name}</span>
        </h1>
        <p className="text-muted-foreground">
          <span className="text-[20px]">
            <span className="text-[20px]">
              {mainTitleSuffix ||
                `${stripeCurrencyAmountToHumanReadableCurrencyAmount(price.currency, price.unitPrice * checkoutSession.quantity)}`}
            </span>
          </span>
        </p>
      </div>

      {/* Product Image */}
      {product.imageURL && (
        <div className="w-full">
          <div
            className={cn(
              'w-full rounded-lg overflow-hidden bg-muted'
            )}
          >
            <Image
              src={product.imageURL}
              alt={product.name}
              width={1200}
              height={800}
              className="w-full h-auto object-contain"
              sizes="(max-width: 768px) 100vw, 448px"
              priority
            />
          </div>
        </div>
      )}
      {/* Product Description */}
      {product.description && (
        <div
          className={cn(
            'text-muted-foreground', // Regular color using muted-foreground
            'space-y-4'
          )}
        >
          <CheckoutMarkdownView
            data-testid="product-description"
            source={product.description}
          />
        </div>
      )}

      {/* Product Features - relational approach */}
      {features && features.length > 0 && (
        <div className="w-full">
          <div className="space-y-3">
            {features.map((feature) => {
              return feature ? (
                <div
                  key={feature.id}
                  className="flex items-start gap-3"
                >
                  <div className="mt-0 flex-shrink-0">
                    <Check className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {feature.name}
                  </span>
                </div>
              ) : null
            })}
          </div>
        </div>
      )}
    </div>
  )
})

BillingHeader.displayName = 'BillingHeader'
