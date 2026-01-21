import { Text } from '@react-email/components'
import type * as React from 'react'
import { BODY_FONT_FAMILY } from '../../styles/fontStyles'

const paragraph = {
  color: '#333',
  fontSize: '14px',
  fontFamily: BODY_FONT_FAMILY,
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
