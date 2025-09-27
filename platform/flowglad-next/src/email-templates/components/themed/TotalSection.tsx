import { Hr, Section } from '@react-email/components'
import * as React from 'react'
import { DetailItem } from './DetailItem'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { CurrencyCode } from '@/types'

const hr = {
  borderColor: '#cccccc',
  margin: '20px 0',
}

const totalSection = {
  margin: '20px 0',
}

export const TotalSection = ({
  subtotal,
  total,
  totalLabelText = 'Total',
  tax,
  discountInfo,
}: {
  subtotal: string
  total: string
  totalLabelText?: string
  tax?: string | null
  discountInfo?: {
    discountName: string
    discountCode: string
    discountAmount: number
    discountAmountType: string
    currency: CurrencyCode
  } | null
}) => {
  // Calculate the original amount (before discount) if there's a discount
  const originalAmount = discountInfo
    ? (() => {
        // Parse the discounted subtotal back to cents
        const discountedSubtotalInCents =
          parseFloat(subtotal.replace(/[^0-9.-]+/g, '')) * 100

        // Add the discount amount to get the original amount
        const originalAmountInCents =
          discountedSubtotalInCents + discountInfo!.discountAmount

        // Convert back to human-readable format
        return stripeCurrencyAmountToHumanReadableCurrencyAmount(
          discountInfo!.currency,
          originalAmountInCents
        )
      })()
    : null
  return (
    <>
      <Hr style={hr} data-testid="total-divider" />
      <Section style={totalSection}>
        {/* Show original amount whenever there's a discount */}
        {originalAmount && (
          <>
            <DetailItem
              dataTestId="original-amount-label"
              style={{ fontWeight: 'bold' }}
            >
              Amount
            </DetailItem>
            <DetailItem dataTestId="original-amount">
              {originalAmount}
            </DetailItem>
          </>
        )}

        {/* Show discount whenever there's discount info */}
        {discountInfo && (
          <>
            <DetailItem
              dataTestId="discount-label"
              style={{ fontWeight: 'bold' }}
            >
              Discount ({discountInfo.discountCode})
            </DetailItem>
            <DetailItem
              dataTestId="discount-amount"
              style={{ color: '#22c55e' }}
            >
              -
              {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                discountInfo.currency as any,
                discountInfo.discountAmount
              )}
            </DetailItem>
          </>
        )}

        {/* Show subtotal when there's tax */}
        {tax && (
          <>
            <DetailItem
              dataTestId="subtotal-label"
              style={{ fontWeight: 'bold' }}
            >
              Subtotal
            </DetailItem>
            <DetailItem dataTestId="subtotal-amount">
              {subtotal}
            </DetailItem>
          </>
        )}

        {/* Show tax whenever it exists */}
        {tax && (
          <>
            <DetailItem
              dataTestId="tax-label"
              style={{ fontWeight: 'bold' }}
            >
              Tax
            </DetailItem>
            <DetailItem dataTestId="tax-amount">{tax}</DetailItem>
          </>
        )}

        {/* Always show total */}
        <DetailItem
          dataTestId="total-label"
          style={{ fontWeight: 'bold' }}
        >
          {totalLabelText}
        </DetailItem>
        <DetailItem dataTestId="total-amount">{total}</DetailItem>
      </Section>
    </>
  )
}
