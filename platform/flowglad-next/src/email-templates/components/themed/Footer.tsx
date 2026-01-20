import { Hr, Link, Section, Text } from '@react-email/components'
import type * as React from 'react'

const footerStyle: React.CSSProperties = {
  marginTop: '32px',
  paddingTop: '24px',
}

const dividerStyle: React.CSSProperties = {
  borderColor: '#e6e6e6',
  margin: '0 0 24px 0',
}

const footerTextStyle: React.CSSProperties = {
  color: '#666666',
  fontSize: '12px',
  lineHeight: '20px',
  margin: '0 0 12px 0',
}

const footerLinkStyle: React.CSSProperties = {
  color: '#666666',
  textDecoration: 'underline',
  marginRight: '16px',
}

const linksContainerStyle: React.CSSProperties = {
  marginTop: '12px',
}

interface FooterLink {
  label: string
  href: string
}

export interface FooterProps {
  /** The organization's display name */
  organizationName: string
  /** Footer variant: 'customer' for end-users, 'organization' for merchants */
  variant?: 'customer' | 'organization'
  /** Billing portal URL - renders "Manage Billing" link */
  billingPortalUrl?: string
  /** Support email - renders "Contact Support" mailto link */
  supportEmail?: string
  /** Custom links to render in the footer */
  links?: FooterLink[]
  /** Whether to show "Powered by Flowglad" - defaults to true for customer variant */
  showPoweredBy?: boolean
  /** Unsubscribe URL for marketing/promotional emails (CAN-SPAM compliance) */
  unsubscribeUrl?: string
}

/**
 * Footer component for email templates.
 *
 * For customer-facing emails, shows organization attribution with optional "Powered by Flowglad".
 * For organization emails, shows Flowglad attribution.
 *
 * @example
 * ```tsx
 * // Customer email with billing portal link
 * <Footer
 *   organizationName="Acme Inc"
 *   variant="customer"
 *   billingPortalUrl="https://billing.acme.com"
 *   supportEmail="support@acme.com"
 * />
 *
 * // Organization email
 * <Footer
 *   organizationName="Acme Inc"
 *   variant="organization"
 * />
 * ```
 */
export const Footer = ({
  organizationName,
  variant = 'customer',
  billingPortalUrl,
  supportEmail,
  links = [],
  showPoweredBy,
  unsubscribeUrl,
}: FooterProps) => {
  // Default showPoweredBy to true for customer emails, false for organization
  const shouldShowPoweredBy = showPoweredBy ?? variant === 'customer'

  const attribution =
    variant === 'customer'
      ? `This email was sent by ${organizationName}.${shouldShowPoweredBy ? ' Powered by Flowglad.' : ''}`
      : 'This email was sent by Flowglad.'

  // Combine standard links with custom links
  const allLinks: FooterLink[] = [
    ...(billingPortalUrl
      ? [{ label: 'Manage Billing', href: billingPortalUrl }]
      : []),
    ...(supportEmail
      ? [{ label: 'Contact Support', href: `mailto:${supportEmail}` }]
      : []),
    ...links,
    ...(unsubscribeUrl
      ? [{ label: 'Unsubscribe', href: unsubscribeUrl }]
      : []),
  ]

  return (
    <Section style={footerStyle} data-testid="email-footer">
      <Hr style={dividerStyle} data-testid="footer-divider" />
      <Text style={footerTextStyle} data-testid="footer-attribution">
        {attribution}
      </Text>
      {allLinks.length > 0 && (
        <div style={linksContainerStyle} data-testid="footer-links">
          {allLinks.map((link, index) => (
            <Link
              key={`${link.label}-${index}`}
              href={link.href}
              style={footerLinkStyle}
              data-testid={`footer-link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </Section>
  )
}
