import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export interface CustomerBillingPortalOTPEmailProps {
  otpCode: string
  customerName?: string
  organizationName: string
}

export function CustomerBillingPortalOTPEmail({
  otpCode = '123456',
  customerName,
  organizationName = 'Acme Inc',
}: CustomerBillingPortalOTPEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Your verification code for {organizationName} billing portal
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Verify Your Email</Heading>

          <Text style={text}>
            {customerName ? `Hi ${customerName},` : 'Hello,'}
          </Text>

          <Text style={text}>
            Use this verification code to access your{' '}
            {organizationName} billing portal:
          </Text>

          <Section style={codeContainer}>
            <Text style={codeStyle}>{otpCode}</Text>
          </Section>

          <Text style={text}>
            This code will expire in 10 minutes. If you didn&apos;t
            request this code, you can safely ignore this email.
          </Text>

          <Text style={footerText}>
            © {new Date().getFullYear()} {organizationName}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default CustomerBillingPortalOTPEmail

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '560px',
}

const h1 = {
  color: '#1f2937',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0',
  textAlign: 'center' as const,
}

const text = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '24px',
  textAlign: 'left' as const,
  padding: '0 40px',
}

const codeContainer = {
  background: '#f3f4f6',
  borderRadius: '8px',
  margin: '24px 40px',
  padding: '24px',
}

const codeStyle = {
  color: '#1f2937',
  fontSize: '32px',
  fontWeight: 'bold' as const,
  letterSpacing: '8px',
  textAlign: 'center' as const,
  margin: '0',
  fontFamily: 'monospace',
}

const footerText = {
  color: '#9ca3af',
  fontSize: '12px',
  lineHeight: '16px',
  textAlign: 'center' as const,
  marginTop: '32px',
  padding: '0 40px',
}
