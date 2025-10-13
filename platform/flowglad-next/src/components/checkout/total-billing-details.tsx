'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { useCheckoutPageContext } from '@/contexts/checkoutPageContext'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CheckoutFlowType,
  CurrencyCode,
  Nullish,
  PriceType,
} from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import {
  calculateTotalDueAmount,
  calculatePriceBaseAmount,
  calculateDiscountAmount,
  calculateInvoiceBaseAmount,
} from '@/utils/bookkeeping/fees/common'
import { Purchase } from '@/db/schema/purchases'
import { FeeCalculation } from '@/db/schema/feeCalculations'
import { Price } from '@/db/schema/prices'
import { Discount } from '@/db/schema/discounts'
import {
  ClientInvoiceWithLineItems,
  InvoiceLineItem,
  InvoiceWithLineItems,
} from '@/db/schema/invoiceLineItems'
import { Invoice } from '@/db/schema/invoices'

export interface TotalBillingDetailsProps
  extends React.HTMLAttributes<HTMLDivElement> {}

const BillingLine = ({
  label,
  amount,
  currency,
  isLoading = false,
  className,
  testId,
}: {
  label: string
  amount: number
  currency: CurrencyCode
  isLoading?: boolean
  className?: string
  testId?: string
}) => {
  return (
    <div
      className={cn('flex justify-between items-center', className)}
    >
      <span className="text-sm text-gray-600">{label}</span>
      {isLoading ? (
        <Skeleton className="h-5 w-16" />
      ) : (
        <span
          className="text-sm font-medium text-gray-900"
          data-testid={testId}
        >
          {stripeCurrencyAmountToHumanReadableCurrencyAmount(
            currency,
            amount
          )}
        </span>
      )}
    </div>
  )
}

interface CoreTotalBillingDetailsParams {
  feeCalculation?: Nullish<FeeCalculation.CustomerRecord>
  discount?: Nullish<Discount.ClientRecord>
}

interface PriceTotalBillingDetailsParams
  extends CoreTotalBillingDetailsParams {
  purchase?: Purchase.ClientRecord
  price: Price.ClientRecord
  invoice: undefined
  type: 'price'
}

interface InvoiceTotalBillingDetailsParams
  extends CoreTotalBillingDetailsParams {
  invoice: Invoice.ClientRecord
  invoiceLineItems: InvoiceLineItem.ClientRecord[]
  price: undefined
  purchase: undefined
  type: 'invoice'
}

type TotalBillingDetailsParams =
  | PriceTotalBillingDetailsParams
  | InvoiceTotalBillingDetailsParams

export const calculateTotalBillingDetails = (
  params: TotalBillingDetailsParams
) => {
  const { purchase, feeCalculation, price, discount, invoice, type } =
    params

  if (!price && !invoice) {
    throw new Error('Either price or invoice is required')
  }
  if (price && invoice) {
    throw new Error(
      'Only one of price or invoice is permitted. Received both'
    )
  }

  const baseAmount =
    type === 'invoice'
      ? calculateInvoiceBaseAmount({
          invoiceLineItems: params.invoiceLineItems,
        })
      : calculatePriceBaseAmount({
          price,
          purchase,
        })

  let subtotalAmount: number = baseAmount
  let discountAmount: number = calculateDiscountAmount(
    baseAmount,
    discount
  )
  let taxAmount: number | null = null
  let totalDueAmount: number = subtotalAmount - (discountAmount ?? 0)

  if (price?.type === PriceType.Usage) {
    totalDueAmount = 0
  }

  if (feeCalculation) {
    return {
      baseAmount,
      subtotalAmount: feeCalculation.baseAmount,
      discountAmount: feeCalculation.discountAmountFixed,
      taxAmount: feeCalculation.taxAmountFixed,
      totalDueAmount: calculateTotalDueAmount(feeCalculation),
    }
  }
  return {
    baseAmount,
    subtotalAmount,
    discountAmount,
    taxAmount,
    totalDueAmount,
  }
}

export const TotalBillingDetails = React.forwardRef<
  HTMLDivElement,
  TotalBillingDetailsProps
>(({ className, ...props }, ref) => {
  const checkoutPageContext = useCheckoutPageContext()
  const {
    discount,
    currency,
    editCheckoutSessionLoading,
    subscriptionDetails,
    feeCalculation,
    flowType,
  } = checkoutPageContext

  // Don't render for add payment method flow
  if (flowType === CheckoutFlowType.AddPaymentMethod) {
    return null
  }

  const isInvoiceFlow = flowType === CheckoutFlowType.Invoice
  const totalBillingDetailsParams: TotalBillingDetailsParams =
    isInvoiceFlow
      ? {
          invoice: checkoutPageContext.invoice,
          invoiceLineItems: checkoutPageContext.invoiceLineItems,
          type: 'invoice',
          purchase: undefined,
          feeCalculation,
          price: undefined,
          discount,
        }
      : {
          purchase: checkoutPageContext.purchase ?? undefined,
          price: checkoutPageContext.price,
          type: 'price',
          discount,
          invoice: undefined,
          feeCalculation,
        }

  const {
    discountAmount,
    taxAmount,
    subtotalAmount,
    totalDueAmount,
  } = calculateTotalBillingDetails(totalBillingDetailsParams)

  // For invoice flows, if the invoice is paid and there's no fee calculation, total due should be 0
  let finalTotalDueAmount = totalDueAmount
  if (
    isInvoiceFlow &&
    checkoutPageContext.invoice?.status === 'paid' &&
    !feeCalculation
  ) {
    finalTotalDueAmount = 0
  }

  let afterwardsTotal: number | null = null
  let afterwardsTotalLabel = ''
  if (subscriptionDetails?.trialPeriodDays) {
    afterwardsTotalLabel = 'Total After Trial'
    // Calculate the actual price after trial (with discount applied)
    const priceAfterTrial =
      subscriptionDetails.pricePerBillingCycle - (discountAmount ?? 0)
    afterwardsTotal = Math.max(0, priceAfterTrial) // Ensure it's not negative
  }
  const hideTotalLabels =
    flowType === CheckoutFlowType.Subscription &&
    checkoutPageContext.price.type === PriceType.Usage

  return (
    <div
      ref={ref}
      className={cn(
        'bg-white text-gray-900 space-y-4 pt-4',
        className
      )}
      {...props}
    >
      {!hideTotalLabels && (
        <BillingLine
          label="Subtotal"
          amount={subtotalAmount}
          currency={currency}
          isLoading={editCheckoutSessionLoading}
          className="text-base"
        />
      )}

      {/* FIXME: check whether fee calculation should not have discountAmount if original price does not have a discount */}

      {!hideTotalLabels &&
        (discount ||
          (discountAmount != null && discountAmount > 0)) && (
          <BillingLine
            label="Discount"
            amount={discountAmount ?? 0}
            currency={currency}
            isLoading={editCheckoutSessionLoading}
          />
        )}

      {taxAmount != null && taxAmount > 0 && (
        <BillingLine
          label="Tax"
          amount={taxAmount}
          currency={currency}
          isLoading={editCheckoutSessionLoading}
        />
      )}

      {afterwardsTotal != null && (
        <BillingLine
          label={afterwardsTotalLabel}
          amount={afterwardsTotal}
          currency={currency}
        />
      )}

      {!hideTotalLabels && (
        <>
          <div className="flex justify-between items-center pt-2">
            <span
              className="text-lg font-semibold text-gray-900"
              data-testid="billing-info-total-due-label"
            >
              {`Total${
                flowType === CheckoutFlowType.Subscription
                  ? ' Due Today'
                  : ''
              }`}
            </span>
            {editCheckoutSessionLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : (
              <span
                className="text-lg font-bold text-gray-900"
                data-testid="billing-info-total-due-amount"
              >
                {finalTotalDueAmount == null
                  ? ''
                  : stripeCurrencyAmountToHumanReadableCurrencyAmount(
                      currency,
                      subscriptionDetails?.trialPeriodDays
                        ? 0
                        : finalTotalDueAmount
                    )}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
})

TotalBillingDetails.displayName = 'TotalBillingDetails'
