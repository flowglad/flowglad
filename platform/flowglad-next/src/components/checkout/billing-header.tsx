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
import { trpc } from '@/app/_trpc/client'
import { encodeCursor } from '@/db/tableUtils'
import { Check } from 'lucide-react'

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

  // Fetch product features relationally
  const { data: productFeaturesData } =
    trpc.productFeatures.list.useQuery(
      {
        cursor: encodeCursor({
          parameters: {
            productId: checkoutPageContext.product?.id,
          },
          createdAt: new Date(0),
          direction: 'forward',
        }),
        limit: 50,
      },
      {
        enabled: !!checkoutPageContext.product?.id,
        retry: false, // Don't retry if auth fails for anonymous users
      }
    )

  const { data: featuresData } =
    trpc.features.getFeaturesForPricingModel.useQuery(
      {
        pricingModelId:
          checkoutPageContext.product?.pricingModelId || '',
      },
      {
        enabled: !!checkoutPageContext.product?.pricingModelId,
        retry: false, // Don't retry if auth fails for anonymous users
      }
    )

  // Debug logging - remove after debugging
  console.log('Product data debug (anonymous checkout):', {
    hasProduct: !!checkoutPageContext.product,
    hasDisplayFeatures:
      !!checkoutPageContext.product?.displayFeatures,
    displayFeaturesLength:
      checkoutPageContext.product?.displayFeatures?.length,
    enabledFeaturesCount:
      checkoutPageContext.product?.displayFeatures?.filter(
        (f) => f.enabled
      )?.length || 0,
    allFeatures: checkoutPageContext.product?.displayFeatures,
    // Relational data
    hasProductFeatures: !!productFeaturesData?.data?.length,
    productFeaturesCount: productFeaturesData?.data?.length || 0,
    hasFeaturesData: !!featuresData?.features?.length,
    featuresDataCount: featuresData?.features?.length || 0,
  })

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
      <div className="flex flex-col gap-2">
        <h1
          className={cn(
            'text-[24px] font-medium leading-[32px]', // LS typography
            'text-foreground dark:text-white' // Adaptive color
          )}
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
          <div className="relative w-full aspect-[760/420] rounded-lg overflow-hidden bg-muted">
            <Image
              src={product.imageURL}
              alt={product.name}
              fill
              className="object-cover object-center"
              sizes="(max-width: 768px) 100vw, 448px"
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

      {/* Product Features - displayFeatures approach */}
      {product.displayFeatures &&
        product.displayFeatures.length > 0 && (
          <div className="w-full">
            <div className="space-y-3">
              {product.displayFeatures
                .filter((feature) => feature.enabled)
                .map((feature, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3"
                    title={feature.details || feature.label}
                  >
                    <div className="mt-0 flex-shrink-0">
                      <Check className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {feature.label}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

      {/* Product Features - relational approach */}
      {!product.displayFeatures?.length &&
        productFeaturesData?.data &&
        featuresData?.features && (
          <div className="w-full">
            <div className="space-y-3">
              {productFeaturesData.data
                .filter((pf) => !pf.expiredAt)
                .map((productFeature) => {
                  const feature = featuresData.features.find(
                    (feat) => feat.id === productFeature.featureId
                  )
                  return feature ? (
                    <div
                      key={productFeature.featureId}
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
