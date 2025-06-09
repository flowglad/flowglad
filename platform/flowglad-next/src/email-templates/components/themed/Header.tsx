import { Heading, Img, Section } from '@react-email/components'
import * as React from 'react'

const logoContainer = {
  marginBottom: '24px',
}

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
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
  const variantStyle: React.CSSProperties =
    variant === 'organization'
      ? { textAlign: 'center', fontWeight: 'normal' }
      : {}

  return (
    <>
      {organizationLogoUrl && (
        <Section style={logoContainer}>
          <Img
            src={organizationLogoUrl}
            width="50"
            height="50"
            alt="Logo"
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
