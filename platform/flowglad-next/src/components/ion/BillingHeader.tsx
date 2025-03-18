'use client'
// Generated with Ion on 10/1/2024, 2:36:05 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=640:29774
import * as React from 'react'
import clsx from 'clsx'
import {
  SubscriptionCheckoutDetails,
  useCheckoutPageContext,
} from '@/contexts/checkoutPageContext'
import { CheckoutFlowType, CurrencyCode, PriceType } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { Purchase } from '@/db/schema/purchases'
import { sentenceCase } from 'change-case'
import core from '@/utils/core'
import Image from 'next/image'
import CheckoutMarkdownView from './CheckoutMarkdownView'

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
      : `${intervalUnit}`
  return `every ${intervalLabel}`
}

const subscriptionSubtitle = (
  subscriptionDetails: SubscriptionCheckoutDetails
) => {
  let subtitle = intervalLabel(subscriptionDetails)
  if (!subscriptionDetails.trialPeriodDays) {
    return sentenceCase(subtitle)
  }
  const humanReadablePrice =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(
      subscriptionDetails.currency,
      subscriptionDetails.pricePerBillingCycle!
    )
  return `Then ${humanReadablePrice} ${subtitle}`
}

const BillingHeader = React.forwardRef<
  HTMLDivElement,
  BillingHeaderProps
>(({ className, ...props }, ref) => {
  const checkoutPageContext = useCheckoutPageContext()

  if (checkoutPageContext.flowType === CheckoutFlowType.Invoice) {
    return null
  }

  const { purchase, price, product, subscriptionDetails, flowType } =
    checkoutPageContext
  let mainTitleSuffix = ''
  if (price.type === PriceType.SinglePayment) {
    mainTitleSuffix = `${stripeCurrencyAmountToHumanReadableCurrencyAmount(
      price.currency,
      core.isNil(purchase?.firstInvoiceValue)
        ? price.unitPrice
        : purchase.firstInvoiceValue
    )}`
  } else if (flowType === CheckoutFlowType.Subscription) {
    mainTitleSuffix = `${stripeCurrencyAmountToHumanReadableCurrencyAmount(
      price.currency,
      subscriptionDetails.pricePerBillingCycle
    )} billed ${intervalLabel(subscriptionDetails)}`
  }
  let subTitle: string | null = null
  if (flowType === CheckoutFlowType.Subscription) {
    subTitle = subscriptionSubtitle(subscriptionDetails)
  }
  return (
    <div
      ref={ref}
      className={clsx('flex flex-col justify-center', className)}
      {...props}
    >
      <div className="w-full flex flex-col gap-1.5">
        <div
          className="text-4xl font-semibold text-on-primary-hover"
          data-testid="billing-header-title"
        >
          {product.name}
        </div>
        <div
          className="text-base font-medium text-foreground"
          data-testid="billing-header-subtitle"
        >
          {mainTitleSuffix}
        </div>
        {product.description && (
          <CheckoutMarkdownView source={product.description} />
        )}
        {product.imageURL && (
          <Image
            src={product.imageURL}
            alt={product.name}
            className="rounded-lg"
            width={380}
            height={210}
          />
        )}
      </div>
    </div>
  )
})

BillingHeader.displayName = 'BillingHeader'

export default BillingHeader
