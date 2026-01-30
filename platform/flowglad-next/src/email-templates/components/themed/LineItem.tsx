import type { CurrencyCode } from '@db-core/enums'
import { Column, Row, Section, Text } from '@react-email/components'
import type * as React from 'react'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

const rowStyle: React.CSSProperties = {
  width: '100%',
  marginBottom: '12px',
}

const nameStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#333',
  margin: 0,
}

const priceStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#333',
  margin: 0,
  textAlign: 'right',
}

/**
 * Two-column line item for invoice/receipt displays.
 * Renders product name on left, price on right.
 *
 * Visual result:
 * ```
 * Product Name (×2)                                    $9.98
 * ```
 */
export const LineItem = ({
  name,
  price,
  quantity,
  currency,
  index,
}: {
  name: string
  price: number
  quantity: number
  currency: CurrencyCode
  index: number
}) => {
  const formattedPrice =
    stripeCurrencyAmountToHumanReadableCurrencyAmount(currency, price)
  // Include quantity in display name if more than 1
  const displayName = quantity > 1 ? `${name} (×${quantity})` : name

  return (
    <Section style={rowStyle} data-testid={`line-item-${index}`}>
      <Row>
        <Column>
          <Text
            style={nameStyle}
            data-testid={`line-item-name-${index}`}
          >
            {displayName}
          </Text>
        </Column>
        <Column align="right">
          <Text
            style={priceStyle}
            data-testid={`line-item-price-${index}`}
          >
            {formattedPrice}
          </Text>
        </Column>
      </Row>
    </Section>
  )
}
