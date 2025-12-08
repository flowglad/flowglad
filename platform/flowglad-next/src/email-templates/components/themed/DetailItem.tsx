import { Text } from '@react-email/components'
import type * as React from 'react'

const itemStyle = {
  margin: '8px 0',
  color: '#333',
  fontSize: '14px',
}

export const DetailItem = ({
  children,
  style,
  dataTestId,
  variant,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  dataTestId?: string
  variant?: 'customer' | 'organization'
}) => {
  const variantStyle: React.CSSProperties =
    variant === 'organization'
      ? { color: '#525f7f', marginBottom: '4px' }
      : {}

  return (
    <Text
      style={{ ...itemStyle, ...variantStyle, ...style }}
      data-testid={dataTestId}
    >
      {children}
    </Text>
  )
}
