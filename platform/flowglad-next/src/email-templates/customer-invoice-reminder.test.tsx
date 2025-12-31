import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InvoiceReminderEmail } from './customer-invoice-reminder'

describe('InvoiceReminderEmail', () => {
  it('renders an absolute invoice view link with the public route', () => {
    const { getByRole } = render(
      <InvoiceReminderEmail
        organizationName="Test Organization"
        customerEmail="customer@example.com"
        customerName="Customer"
        invoice={{
          id: 'inv_123',
          organizationId: 'org_123',
          invoiceNumber: 'INV-123',
        }}
        livemode={false}
      />
    )

    const viewInvoiceLink = getByRole('link', {
      name: /view invoice/i,
    })

    expect(viewInvoiceLink).toHaveAttribute(
      'href',
      'http://localhost:3000/invoice/view/org_123/inv_123'
    )
  })
})
