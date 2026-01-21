import {
  Body,
  Container,
  Head,
  Html,
  Preview,
} from '@react-email/components'
import type * as React from 'react'
import { BODY_FONT_FAMILY } from '../../styles/fontStyles'

const main = {
  backgroundColor: '#ffffff',
  fontFamily: BODY_FONT_FAMILY,
}

const container = {
  margin: '0 auto',
  padding: '20px 20px 48px',
  width: '580px',
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
