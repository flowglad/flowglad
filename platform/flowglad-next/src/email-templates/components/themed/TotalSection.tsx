import { Hr, Section } from '@react-email/components'
import * as React from 'react'
import { DetailItem } from './DetailItem'

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
  showSubtotal = true,
  totalLabelText = 'Total',
}: {
  subtotal: string
  total: string
  showSubtotal?: boolean
  totalLabelText?: string
}) => {
  return (
    <>
      <Hr style={hr} data-testid="total-divider" />
      <Section style={totalSection}>
        {showSubtotal && (
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
