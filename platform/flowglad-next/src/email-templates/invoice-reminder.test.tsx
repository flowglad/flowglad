import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FLOWGLAD_LEGAL_ENTITY } from '@/constants/mor'
import type { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import type { Invoice } from '@/db/schema/invoices'
import {
  CountryCode,
  CurrencyCode,
  InvoiceStatus,
  InvoiceType,
  SubscriptionItemType,
} from '@/types'
import { InvoiceReminderEmail } from './invoice-reminder'

describe('InvoiceReminderEmail', () => {
  const mockInvoice: Invoice.Record = {
    id: 'inv_123',
    organizationId: 'org_123',
    customerId: 'cus_123',
    invoiceNumber: 'INV-001',
    invoiceDate: new Date('2024-03-20').getTime(),
    dueDate: new Date('2024-04-20').getTime(),
    currency: CurrencyCode.USD,
    subtotal: 5000,
    taxAmount: 500,
    status: InvoiceStatus.Open,
    livemode: true,
    pdfURL: null,
    receiptPdfURL: null,
    taxCountry: CountryCode.US,
    taxRatePercentage: null,
    stripeTaxCalculationId: null,
    stripeTaxTransactionId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    type: InvoiceType.Standalone,
    purchaseId: null,
    billingPeriodId: null,
    subscriptionId: null,
    stripePaymentIntentId: null,
    billingRunId: null,
    billingPeriodStartDate: null,
    billingPeriodEndDate: null,
    ownerMembershipId: null,
    memo: null,
    bankPaymentOnly: false,
    taxType: null,
    taxState: null,
    applicationFee: null,
    createdByCommit: null,
    updatedByCommit: null,
    position: 1,
  }

  const mockLineItems: InvoiceLineItem.Record[] = [
    {
      id: 'ili_123',
      invoiceId: 'inv_123',
      description: 'Test Product',
      quantity: 1,
      price: 5000,
      priceId: 'price_123',
      livemode: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByCommit: null,
      updatedByCommit: null,
      position: 1,
      type: SubscriptionItemType.Static,
      billingRunId: null,
      ledgerAccountId: null,
      ledgerAccountCredit: null,
    },
  ]

  const mockProps = {
    invoice: mockInvoice,
    invoiceLineItems: mockLineItems,
    organizationLogoUrl: 'https://example.com/logo.png',
    organizationName: 'Test Organization',
    livemode: true,
  }

  describe('basic rendering', () => {
    it('should render the email template with invoice reminder details', () => {
      const { getByTestId, getByText } = render(
        <InvoiceReminderEmail {...mockProps} />
      )

      expect(getByTestId('email-title')).toHaveTextContent(
        'Invoice Reminder'
      )
      expect(getByText(/Invoice #: INV-001/)).toBeInTheDocument()
    })

    it('should display organization logo when provided', () => {
      const { getByAltText } = render(
        <InvoiceReminderEmail {...mockProps} />
      )

      expect(getByAltText('Logo')).toHaveAttribute(
        'src',
        mockProps.organizationLogoUrl
      )
    })

    it('should render without organization logo when not provided', () => {
      const propsWithoutLogo = {
        ...mockProps,
        organizationLogoUrl: undefined,
      }
      const { queryByAltText } = render(
        <InvoiceReminderEmail {...propsWithoutLogo} />
      )

      expect(queryByAltText('Logo')).not.toBeInTheDocument()
    })
  })

  describe('MoR Support', () => {
    describe('when isMoR is false', () => {
      it('should render organization branding', () => {
        const { getByAltText } = render(
          <InvoiceReminderEmail {...mockProps} isMoR={false} />
        )

        expect(getByAltText('Logo')).toHaveAttribute(
          'src',
          mockProps.organizationLogoUrl
        )
      })

      it('should not show card statement descriptor notice', () => {
        const { queryByText } = render(
          <InvoiceReminderEmail {...mockProps} isMoR={false} />
        )

        expect(
          queryByText(/This purchase was processed by/)
        ).not.toBeInTheDocument()
      })

      it('should show organization name in signature', () => {
        const { getByText } = render(
          <InvoiceReminderEmail {...mockProps} isMoR={false} />
        )

        const signatureElements = document.querySelectorAll('p')
        const signatureText = Array.from(signatureElements)
          .map((el) => el.textContent)
          .join(' ')
        expect(signatureText).toContain(mockProps.organizationName)
      })
    })

    describe('when isMoR is true', () => {
      it('should show Flowglad branding', () => {
        const { getByAltText } = render(
          <InvoiceReminderEmail {...mockProps} isMoR={true} />
        )

        expect(getByAltText('Logo')).toHaveAttribute(
          'src',
          FLOWGLAD_LEGAL_ENTITY.logoURL
        )
      })

      it('should include card statement descriptor notice', () => {
        const { container } = render(
          <InvoiceReminderEmail {...mockProps} isMoR={true} />
        )

        // The text contains the card statement descriptor in the MoR notice
        expect(container.textContent).toContain(
          FLOWGLAD_LEGAL_ENTITY.cardStatementDescriptor
        )
        expect(container.textContent).toContain(
          'This purchase was processed by'
        )
      })

      it('should show "for [merchant]" in signature', () => {
        const { getByText } = render(
          <InvoiceReminderEmail {...mockProps} isMoR={true} />
        )

        expect(
          getByText(
            `${FLOWGLAD_LEGAL_ENTITY.name} for ${mockProps.organizationName}`
          )
        ).toBeInTheDocument()
      })

      it('should mention the merchant in MoR notice', () => {
        const { container } = render(
          <InvoiceReminderEmail {...mockProps} isMoR={true} />
        )

        expect(container.textContent).toContain(
          mockProps.organizationName
        )
      })

      it('should still display invoice details correctly', () => {
        const { getByText } = render(
          <InvoiceReminderEmail {...mockProps} isMoR={true} />
        )

        expect(getByText(/Invoice #: INV-001/)).toBeInTheDocument()
      })
    })
  })
})
