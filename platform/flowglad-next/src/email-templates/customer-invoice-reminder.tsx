import * as React from 'react'
import { emailBaseUrl } from '@/utils/core'
import { EmailButton } from './components/EmailButton'
import TestModeBanner from './components/TestBanner'
import {
  EmailLayout,
  Header,
  Paragraph,
  Signature,
} from './components/themed'

export interface InvoiceReminderEmailProps {
  organizationName: string
  organizationLogoUrl?: string
  customerName?: string
  customerEmail: string
  invoice: {
    id: string
    organizationId: string
    invoiceNumber?: string
  }
  livemode: boolean
}

export const InvoiceReminderEmail = ({
  organizationName,
  organizationLogoUrl,
  customerName,
  customerEmail,
  invoice,
  livemode,
}: InvoiceReminderEmailProps) => {
  const displayName = customerName || customerEmail
  const invoiceUrl = `${emailBaseUrl}/invoice/view/${invoice.organizationId}/${invoice.id}`

  return (
    <EmailLayout previewText="Invoice Reminder" variant="customer">
      <TestModeBanner livemode={livemode} />
      <Header
        title="Invoice Reminder"
        organizationLogoUrl={organizationLogoUrl}
        variant="customer"
      />
      <Paragraph variant="customer">Hi {displayName},</Paragraph>
      <Paragraph variant="customer">
        This is a reminder that you have an outstanding invoice
        {invoice.invoiceNumber ? ` (#${invoice.invoiceNumber})` : ''}.
      </Paragraph>
      <EmailButton href={invoiceUrl} testId="view-invoice-link">
        View Invoice →
      </EmailButton>
      <Signature
        greeting="Best,"
        name={organizationName}
        greetingDataTestId="signature-best"
        nameDataTestId="signature-org-name"
      />
    </EmailLayout>
  )
}

export default InvoiceReminderEmail
