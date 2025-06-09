import { Text } from '@react-email/components'
import * as React from 'react'

const paragraph = {
  color: '#333',
  fontSize: '14px',
  margin: '0 0 20px',
}

export const Paragraph = ({
  children,
  style,
  variant,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  variant?: 'customer' | 'organization'
}) => {
  const variantStyle: React.CSSProperties =
    variant === 'organization'
      ? { color: '#525f7f', textAlign: 'center', margin: 0 }
      : {}
  return (
    <Text style={{ ...paragraph, ...variantStyle, ...style }}>
      {children}
    </Text>
  )
}
