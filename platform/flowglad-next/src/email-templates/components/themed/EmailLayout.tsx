import {
  Body,
  Container,
  Head,
  Html,
  Preview,
} from '@react-email/components'
import type * as React from 'react'
import { BODY_FONT_FAMILY } from '../../styles/fontStyles'

/**
 * Brand background color from globals.css:
 * --background: hsl(51, 47%, 97%) → #FBFAF4 (cream)
 */
const main: React.CSSProperties = {
  backgroundColor: '#FBFAF4',
  fontFamily: BODY_FONT_FAMILY,
}

/**
 * Container with improved spacing based on industry best practices:
 * - Narrower width (456px) for better readability
 * - More vertical breathing room (40px top, 56px bottom)
 * - Reduced side padding (16px) for better mobile responsiveness
 */
const container: React.CSSProperties = {
  margin: '0 auto',
  padding: '40px 16px 56px', // More vertical breathing room
  width: '456px', // Narrower for better readability
  maxWidth: '100%', // Responsive on mobile
  borderLeft: '1px dashed #e5e3e0',
  borderRight: '1px dashed #e5e3e0',
}

export const EmailLayout = ({
  previewText,
  children,
  mainStyle,
  containerStyle,
  variant = 'customer',
}: {
  previewText: string
  children: React.ReactNode
  mainStyle?: React.CSSProperties
  containerStyle?: React.CSSProperties
  variant?: 'customer' | 'organization'
}) => {
  const variantStyle: React.CSSProperties =
    variant === 'organization'
      ? { backgroundColor: '#f6f9fc', padding: '16px 16px 32px' }
      : {}

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ ...main, ...mainStyle }}>
        <Container
          style={{ ...container, ...variantStyle, ...containerStyle }}
        >
          {children}
        </Container>
      </Body>
    </Html>
  )
}
