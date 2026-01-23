import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import * as React from 'react'
import { emailBaseUrl } from '@/utils/core'
import TestModeBanner from './components/TestBanner'

interface SendPurchaseAccessSessionTokenEmailProps {
  magicLink?: string
  livemode: boolean
}

export const SendPurchaseAccessSessionTokenEmail = ({
  magicLink,
  livemode,
}: SendPurchaseAccessSessionTokenEmailProps) => (
  <Html>
    <Head />
    <Preview>Access your order with this magic link.</Preview>
    <Body style={main}>
      <TestModeBanner livemode={livemode} />
      <Container style={container}>
        <Img
          src={`${emailBaseUrl}/images/email/Flowglad-email-logo.jpg`}
          width={48}
          height={48}
          alt="Flowglad"
        />
        <Heading style={heading}>Access your Order</Heading>
        <Section style={body}>
          <Text style={paragraph}>
            <Link style={link} href={magicLink}>
              👉 Click here to access your order 👈
            </Link>
          </Text>
          <Text style={paragraph}>
            If you didn&apos;t request this, please ignore this email.
          </Text>
        </Section>
        <Text style={paragraph}>
          Best,
          <br />- Flowglad Team
        </Text>
        <Hr style={hr} />
        <Img
          src={`${emailBaseUrl}/images/email/Flowglad-email-logo.jpg`}
          width={32}
          height={32}
          style={{
            WebkitFilter: 'grayscale(100%)',
            filter: 'grayscale(100%)',
            margin: '20px 0',
          }}
        />
        <Text style={footer}>Flowglad Inc.</Text>
      </Container>
    </Body>
  </Html>
)

SendPurchaseAccessSessionTokenEmail.PreviewProps = {
  magicLink: 'https://app.flowglad.com',
} as SendPurchaseAccessSessionTokenEmailProps

export default SendPurchaseAccessSessionTokenEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
}

const container = {
  margin: '0 auto',
  padding: '20px 25px 48px',
  backgroundImage: 'url("/assets/raycast-bg.png")',
  backgroundPosition: 'bottom',
  backgroundRepeat: 'no-repeat, no-repeat',
}

const heading = {
  fontSize: '28px',
  fontWeight: 'bold',
  marginTop: '48px',
}

const body = {
  margin: '24px 0',
}

const paragraph = {
  fontSize: '16px',
  lineHeight: '26px',
}

const link = {
  color: '#FF6363',
}

const hr: React.CSSProperties = {
  borderColor: '#dddddd',
  borderTop: 'none',
  borderLeft: 'none',
  borderRight: 'none',
  borderBottomWidth: '1px',
  borderBottomStyle: 'dashed',
  marginTop: '48px',
}

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  marginLeft: '4px',
}
