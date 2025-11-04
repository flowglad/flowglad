import { Heading, Section } from '@react-email/components'
import * as React from 'react'

const bannerStyle: React.CSSProperties = {
  backgroundColor: '#eab308',
  padding: '8px',
  margin: 0,
  textAlign: 'center',
}

const headingStyle: React.CSSProperties = {
  color: '#000000',
  fontSize: '30px',
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
        TEST MODE
      </Heading>
    </Section>
  )
}
