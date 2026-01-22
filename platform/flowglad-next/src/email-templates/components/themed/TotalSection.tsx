import { Hr, Section } from '@react-email/components'
import * as React from 'react'
import type { CurrencyCode } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { DetailItem } from './DetailItem'

const hr: React.CSSProperties = {
  borderColor: '#cccccc',
  borderTop: 'none',
  borderLeft: 'none',
  borderRight: 'none',
  borderBottomWidth: '1px',
  borderBottomStyle: 'dashed',
  margin: '20px 0',
}

const totalSection = {
  margin: '20px 0',
}

export const TotalSection = ({
  originalAmount,
  subtotal,
  total,
  totalLabelText = 'Total',
  tax,
  discountInfo,
}: {
  originalAmount?: string
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
  return (
    <>
      <Hr style={hr} data-testid="total-divider" />
      <Section style={totalSection}>
        {/* Show original amount and discount whenever there's discount info */}
        {discountInfo && (
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

        {/* Show subtotal and tax whenever it exists */}
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
