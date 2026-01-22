import { Link, Text } from '@react-email/components'
import type * as React from 'react'

/**
 * Brand color from globals.css - used for links
 */
const BRAND_ORANGE = '#DA853A'

const paragraphStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#333',
  lineHeight: '24px',
  marginBottom: '16px',
}

const linkStyle: React.CSSProperties = {
  color: BRAND_ORANGE,
  textDecoration: 'underline',
}

export interface HelpfulLinksProps {
  /**
   * Card statement descriptor (e.g., "FLGLD* ACME")
   * Source: FLOWGLAD_LEGAL_ENTITY.cardStatementDescriptor from @/constants/mor
   * Only shown for MoR transactions
   */
  statementDescriptor?: string
  /**
   * Invoice view URL - pattern: ${core.NEXT_PUBLIC_APP_URL}/invoice/view/${organizationId}/${invoiceId}
   * Note: Not relevant for Subscription Confirmed emails (no invoice exists yet)
   * Only include for payment/receipt emails where an invoice has been created
   */
  invoiceUrl?: string
  /** Billing portal URL */
  billingPortalUrl?: string
}

/**
 * Helpful secondary action links for email templates.
 * Provides self-service options and sets expectations for bank statements.
 *
 * @example
 * ```tsx
 * // For payment/receipt emails (where invoice exists):
 * <HelpfulLinks
 *   statementDescriptor={`${FLOWGLAD_LEGAL_ENTITY.cardStatementDescriptor} ${organizationName}`}
 *   invoiceUrl={`${core.NEXT_PUBLIC_APP_URL}/invoice/view/${organizationId}/${invoiceId}`}
 *   billingPortalUrl={billingPortalUrl}
 * />
 *
 * // For subscription confirmed emails (no invoice yet):
 * <HelpfulLinks
 *   billingPortalUrl={billingPortalUrl}
 * />
 * ```
 */
export const HelpfulLinks = ({
  statementDescriptor,
  invoiceUrl,
  billingPortalUrl,
}: HelpfulLinksProps) => {
  // Don't render anything if no props provided
  if (!statementDescriptor && !invoiceUrl && !billingPortalUrl) {
    return null
  }

  return (
    <>
      {statementDescriptor && (
        <Text
          style={paragraphStyle}
          data-testid="statement-descriptor-notice"
        >
          This payment will appear as{' '}
          <strong>{statementDescriptor}</strong> on your bank or card
          statement.
        </Text>
      )}

      {invoiceUrl && (
        <Text
          style={paragraphStyle}
          data-testid="invoice-link-section"
        >
          Need an invoice for your records?
          <br />
          <Link
            href={invoiceUrl}
            style={linkStyle}
            data-testid="view-invoice-link"
          >
            View Invoice →
          </Link>
        </Text>
      )}

      {billingPortalUrl && (
        <Text
          style={paragraphStyle}
          data-testid="billing-portal-section"
        >
          Manage your subscription and payment methods in the{' '}
          <Link
            href={billingPortalUrl}
            style={linkStyle}
            data-testid="billing-portal-link"
          >
            billing portal
          </Link>
          .
        </Text>
      )}
    </>
  )
}
