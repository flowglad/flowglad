import { Column, Row, Section, Text } from '@react-email/components'
import * as React from 'react'
import type { CurrencyCode } from '@/types'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'

const productDetails = {
  marginBottom: '30px',
}

const productNameStyle = {
  fontSize: '14px',
  fontWeight: 'bold',
  margin: '0',
  color: '#333',
}

const productPriceStyle = {
  fontSize: '14px',
  margin: '4px 0 0',
  color: '#333',
}

const productQuantityStyle = {
  fontSize: '14px',
  margin: '4px 0 0',
  color: '#333',
}

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
  return (
    <Section
      style={productDetails}
      key={index}
      data-testid={`line-item-${index}`}
    >
      <Row>
        <Column>
          <Text
            style={productNameStyle}
            data-testid={`line-item-name-${index}`}
          >
            {name}
          </Text>
          <Text
            style={productPriceStyle}
            data-testid={`line-item-price-${index}`}
          >
            {stripeCurrencyAmountToHumanReadableCurrencyAmount(
              currency,
              price
            )}
          </Text>
          <Text
            style={productQuantityStyle}
            data-testid={`line-item-quantity-${index}`}
          >
            Quantity: {quantity}
          </Text>
        </Column>
      </Row>
    </Section>
  )
}
