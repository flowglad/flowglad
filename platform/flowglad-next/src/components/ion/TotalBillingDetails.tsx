'use client'
// Generated with Ion on 10/1/2024, 2:36:06 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=640:29776
import * as React from 'react'
import clsx from 'clsx'
import { useCheckoutPageContext } from '@/contexts/checkoutPageContext'
import {
  CheckoutFlowType,
  CurrencyCode,
  Nullish,
  PriceType,
} from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { FallbackSkeleton } from './Skeleton'
import {
  calculateVariantBaseAmount,
  calculateDiscountAmount,
  calculateTotalDueAmount,
  calculateInvoiceBaseAmount,
} from '@/utils/bookkeeping/fees'
import { isNil } from '@/utils/core'
import { Purchase } from '@/db/schema/purchases'
import { FeeCalculation } from '@/db/schema/feeCalculations'
import { Variant } from '@/db/schema/variants'
import { Discount } from '@/db/schema/discounts'
import {
  ClientInvoiceWithLineItems,
  InvoiceLineItem,
  InvoiceWithLineItems,
} from '@/db/schema/invoiceLineItems'
import { Invoice } from '@/db/schema/invoices'

export interface TotalBillingDetailsProps
  extends React.HTMLAttributes<HTMLDivElement> {}

const PurchasSessionDependentLine = ({
  label,
  amount,
  currency,
  editCheckoutSessionLoading,
}: {
  label: string
  amount: number
  currency: CurrencyCode
  editCheckoutSessionLoading?: boolean
}) => {
  return (
    <div className="w-full relative flex justify-between">
      <div className="relative flex">
        <div className="relative">
          <span className="text-sm leading-tight opacity-50 text-white">
            Discount
          </span>
        </div>
      </div>
      <FallbackSkeleton showSkeleton={editCheckoutSessionLoading}>
        <p className="text-sm leading-tight text-white">
          {stripeCurrencyAmountToHumanReadableCurrencyAmount(
            currency,
            amount
          )}
        </p>
      </FallbackSkeleton>
    </div>
  )
}

interface CoreTotalBillingDetailsParams {
  feeCalculation?: Nullish<FeeCalculation.CustomerRecord>
  discount?: Nullish<Discount.ClientRecord>
}
interface VariantTotalBillingDetailsParams
  extends CoreTotalBillingDetailsParams {
  purchase?: Purchase.ClientRecord
  variant: Variant.ClientRecord
  invoice: undefined
  type: 'variant'
}

interface InvoiceTotalBillingDetailsParams
  extends CoreTotalBillingDetailsParams {
  invoice: Invoice.ClientRecord
  invoiceLineItems: InvoiceLineItem.ClientRecord[]
  variant: undefined
  purchase: undefined
  type: 'invoice'
}

type TotalBillingDetailsParams =
  | VariantTotalBillingDetailsParams
  | InvoiceTotalBillingDetailsParams
const calculateTotalBillingDetails = (
  params: TotalBillingDetailsParams
) => {
  const {
    purchase,
    feeCalculation,
    variant,
    discount,
    invoice,
    type,
  } = params
  if (!variant && !invoice) {
    throw new Error('Either variant or invoice is required')
  }
  if (variant && invoice) {
    throw new Error(
      'Only one of variant or invoice is permitted. Received both'
    )
  }

  const baseAmount =
    type === 'invoice'
      ? calculateInvoiceBaseAmount({
          invoice,
          invoiceLineItems: params.invoiceLineItems,
        })
      : calculateVariantBaseAmount({
          variant,
          purchase,
        })
  let subtotalAmount: number = baseAmount
  let discountAmount: number | null = calculateDiscountAmount(
    baseAmount,
    discount
  )
  let taxAmount: number | null = null
  let totalDueAmount: number = subtotalAmount - (discountAmount ?? 0)
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

const TotalBillingDetails = React.forwardRef<
  HTMLDivElement,
  TotalBillingDetailsProps
>(({ className, ...props }, ref) => {
  const checkoutPageContext = useCheckoutPageContext()
  const {
    // variant,
    discount,
    currency,
    editCheckoutSessionLoading,
    subscriptionDetails,
    feeCalculation,
    flowType,
  } = checkoutPageContext
  let afterwardsTotal: number | null = null
  let afterwardsTotalLabel = ''
  if (subscriptionDetails?.trialPeriodDays) {
    afterwardsTotalLabel = 'Total After Trial'
    afterwardsTotal = subscriptionDetails.pricePerBillingCycle
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
          variant: undefined,
          discount,
        }
      : {
          purchase: checkoutPageContext.purchase ?? undefined,
          variant: checkoutPageContext.variant,
          type: 'variant',
          discount,
          invoice: undefined,
          feeCalculation,
        }
  const {
    subtotalAmount,
    discountAmount,
    taxAmount,
    baseAmount,
    totalDueAmount,
  } = calculateTotalBillingDetails(totalBillingDetailsParams)

  return (
    <div
      ref={ref}
      className={clsx('relative flex flex-col pb-4 gap-2', className)}
      {...props}
    >
      <div className="w-full relative flex justify-between border-opacity-10 border-white py-4 gap-4 text-sm leading-tight text-white">
        <div>Subtotal</div>
        <div
          className="font-bold"
          data-testid="billing-info-subtotal-amount"
        >
          {stripeCurrencyAmountToHumanReadableCurrencyAmount(
            currency,
            baseAmount
          )}
        </div>
      </div>
      {discount ? (
        <PurchasSessionDependentLine
          label="Discount"
          amount={discountAmount ?? 0}
          currency={currency}
          editCheckoutSessionLoading={editCheckoutSessionLoading}
        />
      ) : null}
      {taxAmount ? (
        <PurchasSessionDependentLine
          label="Tax"
          amount={taxAmount ?? 0}
          currency={currency}
          editCheckoutSessionLoading={editCheckoutSessionLoading}
        />
      ) : null}
      {afterwardsTotal && (
        <div className="flex items-center justify-between gap-2 text-sm text-foreground pb-4">
          <span data-testid="billing-info-total-afterwards-label">
            {afterwardsTotalLabel}
          </span>
          <span data-testid="billing-info-total-afterwards-amount">
            {stripeCurrencyAmountToHumanReadableCurrencyAmount(
              currency,
              afterwardsTotal
            )}
          </span>
        </div>
      )}

      <div className="w-full relative flex justify-between items-end border-opacity-10 border-t border-white pt-8 text-white">
        <div
          className="text-sm font-bold leading-tight pt-[1px] pb-0.5"
          data-testid="billing-info-total-due-label"
        >
          {`Total Due${
            flowType === CheckoutFlowType.Subscription ? ' Today' : ''
          }`}
        </div>
        <FallbackSkeleton showSkeleton={editCheckoutSessionLoading}>
          <div
            className="text-base leading-5 font-bold"
            data-testid="billing-info-total-due-amount"
          >
            {isNil(totalDueAmount)
              ? ''
              : stripeCurrencyAmountToHumanReadableCurrencyAmount(
                  currency,
                  totalDueAmount
                )}
          </div>
        </FallbackSkeleton>
      </div>
    </div>
  )
})

TotalBillingDetails.displayName = 'TotalBillingDetails'

export default TotalBillingDetails
