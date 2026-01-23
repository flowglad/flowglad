import { Text } from '@react-email/components'
import type * as React from 'react'
import { BODY_FONT_FAMILY } from '../../styles/fontStyles'

/**
 * Paragraph styles with improved readability:
 * - More generous line height (28px, ~2x font size)
 * - Increased bottom margin for better visual separation
 * - Body text color: #797063 (muted brown)
 */
const paragraph: React.CSSProperties = {
  color: '#797063',
  fontSize: '14px',
  fontFamily: BODY_FONT_FAMILY,
  lineHeight: '28px', // More generous line height (2x)
  margin: '0 0 24px', // Increased bottom margin
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
    variant === 'organization' ? { textAlign: 'left' } : {}
  return (
    <Text style={{ ...paragraph, ...variantStyle, ...style }}>
      {children}
    </Text>
  )
}
