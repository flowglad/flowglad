import { Heading, Section } from '@react-email/components'
import type * as React from 'react'

const bannerStyle: React.CSSProperties = {
  backgroundColor: '#F0EAE5',
  padding: '8px',
  margin: 0,
  textAlign: 'center',
  borderRadius: '4px',
}

const headingStyle: React.CSSProperties = {
  color: '#DF7A20',
  fontSize: '18px',
  margin: 0,
  padding: 0,
}

export default function TestModeBanner({
  livemode,
}: {
  livemode: boolean
}) {
  if (livemode) return null

  return (
    <Section style={bannerStyle}>
      <Heading style={headingStyle} as="h2">
        Test mode
      </Heading>
    </Section>
  )
}
