import { Heading, Img, Section } from '@react-email/components'
import type * as React from 'react'
import { HEADING_FONT_FAMILY } from '../../styles/fontStyles'

const logoContainer: React.CSSProperties = {
  marginBottom: '24px',
}

/**
 * Logo style with app-like border radius (not fully circular)
 * for a more modern, app icon appearance
 */
const logoStyle: React.CSSProperties = {
  width: '64px',
  height: '64px',
  borderRadius: '12px', // App-like rounded corners
  objectFit: 'cover',
}

/**
 * Headline color from brand palette: #141312 (near black)
 */
const h1: React.CSSProperties = {
  color: '#141312',
  fontSize: '24px',
  fontWeight: 'normal',
  fontFamily: HEADING_FONT_FAMILY,
  margin: '30px 0',
  padding: '0',
  lineHeight: '42px',
}

export const Header = ({
  title,
  organizationLogoUrl,
  style,
  variant,
}: {
  title: string
  organizationLogoUrl?: string
  style?: React.CSSProperties
  variant?: 'customer' | 'organization'
}) => {
  // Variant prop kept for potential future use, but styling is now unified
  const variantStyle: React.CSSProperties = {}

  return (
    <>
      {organizationLogoUrl && (
        <Section style={logoContainer}>
          <Img
            src={organizationLogoUrl}
            width="64"
            height="64"
            alt="Logo"
            style={logoStyle}
          />
        </Section>
      )}
      <Heading
        style={{ ...h1, ...variantStyle, ...style }}
        data-testid="email-title"
      >
        {title}
      </Heading>
    </>
  )
}
