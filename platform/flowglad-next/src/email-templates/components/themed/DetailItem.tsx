import { Text } from '@react-email/components'
import * as React from 'react'

const itemStyle = {
  margin: '8px 0',
  color: '#333',
  fontSize: '14px',
}

export const DetailItem = ({
  children,
  style,
  dataTestId,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  dataTestId?: string
}) => (
  <Text style={{ ...itemStyle, ...style }} data-testid={dataTestId}>
    {children}
  </Text>
)
