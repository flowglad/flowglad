/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { FLOWGLAD_LEGAL_ENTITY } from '@/constants/mor'
import type { Customer } from '@/db/schema/customers'
import type { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import type { Invoice } from '@/db/schema/invoices'
import type { Organization } from '@/db/schema/organizations'
import type { Payment } from '@/db/schema/payments'
import {
  CurrencyCode,
  InvoiceStatus,
  InvoiceType,
  PaymentStatus,
} from '@/types'
import { formatDate } from '@/utils/core'
import {
  BillingInfo,
  DocumentHeader,
  InvoiceLineItems,
  InvoiceTemplate,
  InvoiceTotals,
  PaymentInfo,
  SellerContactInfo,
} from './invoices'

// ============================================================================
// Mock Data Factories
// ============================================================================

let idCounter = 1

function createMockOrganization(
  overrides: Partial<Organization.Record> = {}
): Organization.Record {
  const id = `org_${idCounter++}`
  return {
    id,
    name: 'Test Organization',
    createdAt: new Date(),
    updatedAt: new Date(),
    domain: 'test.com',
    livemode: false,
    logoURL: null,
    slug: 'test-org',
    stripeConnectAccountId: null,
    stripeCustomerId: `cus_${idCounter++}`,
    subdomain: null,
    faviconURL: null,
    primaryColor: null,
    accentColor: null,
    currency: CurrencyCode.USD,
    ...overrides,
  }
}

function createMockCustomer(
  overrides: Partial<Customer.Record> = {}
): Customer.Record {
  const id = `cust_${idCounter++}`
  return {
    id,
    name: 'Test Customer',
    email: 'customer@test.com',
    organizationId: `org_${idCounter}`,
    livemode: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    externalId: null,
    stripeCustomerId: `cus_${idCounter++}`,
    invoiceNumberBase: null,
    billingAddress: {
      name: 'Test Customer',
      address: {
        line1: '123 Test St',
        line2: null,
        city: 'Test City',
        state: 'CA',
        postal_code: '94105',
        country: 'US',
      },
    },
    ...overrides,
  }
}

function createMockInvoice(
  overrides: Partial<Invoice.Record> = {}
): Invoice.Record {
  const id = `inv_${idCounter++}`
  const now = Date.now()
  return {
    id,
    customerId: `cust_${idCounter}`,
    organizationId: `org_${idCounter}`,
    livemode: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    invoiceNumber: `INV-${idCounter}`,
    status: InvoiceStatus.Draft,
    type: InvoiceType.Purchase,
    subtotal: 6000,
    taxAmount: 0,
    billingPeriodId: null,
    purchaseId: null,
    subscriptionId: null,
    dueDate: now + 30 * 24 * 60 * 60 * 1000, // 30 days from now
    currency: CurrencyCode.USD,
    stripeInvoiceId: null,
    stripeTaxTransactionId: null,
    taxCountry: null,
    taxState: null,
    ...overrides,
  }
}

function createMockInvoiceLineItem(
  overrides: Partial<InvoiceLineItem.Record> = {}
): InvoiceLineItem.Record {
  const id = `ili_${idCounter++}`
  return {
    id,
    invoiceId: `inv_${idCounter}`,
    livemode: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    description: 'Test Description',
    quantity: 1,
    price: 2500,
    priceId: `price_${idCounter}`,
    ...overrides,
  }
}

function createMockPayment(
  overrides: Partial<Payment.Record> = {}
): Payment.Record {
  const id = `pay_${idCounter++}`
  return {
    id,
    invoiceId: `inv_${idCounter}`,
    customerId: `cust_${idCounter}`,
    organizationId: `org_${idCounter}`,
    livemode: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    amount: 6000,
    status: PaymentStatus.Succeeded,
    currency: CurrencyCode.USD,
    stripePaymentIntentId: `pi_${idCounter++}`,
    stripeChargeId: `ch_${idCounter++}`,
    chargeDate: Date.now(),
    refunded: false,
    refundedAmount: null,
    refundedAt: null,
    billingRunId: null,
    checkoutSessionId: null,
    paymentMethodId: null,
    type: 'charge',
    ...overrides,
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Invoice Components', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let invoice: Invoice.Record
  let invoiceLineItems: InvoiceLineItem.Record[]
  let payment: Payment.Record

  beforeEach(() => {
    // Reset counter for each test to ensure consistent IDs
    idCounter = 1

    // Setup test data with mock factories
    organization = createMockOrganization()
    customer = createMockCustomer({ organizationId: organization.id })
    invoice = createMockInvoice({
      customerId: customer.id,
      organizationId: organization.id,
      status: InvoiceStatus.Draft,
      subtotal: 6000,
    })
    invoiceLineItems = [
      createMockInvoiceLineItem({
        invoiceId: invoice.id,
        quantity: 2,
        price: 2500, // $25.00
      }),
      createMockInvoiceLineItem({
        invoiceId: invoice.id,
        quantity: 1,
        price: 1000, // $10.00
      }),
    ]
    payment = createMockPayment({
      invoiceId: invoice.id,
      amount: 6000, // $60.00
      status: PaymentStatus.Succeeded,
      customerId: customer.id,
      organizationId: organization.id,
    })
  })

  describe('InvoiceTotals', () => {
    it('should display correct subtotal, tax, and total for invoice mode', () => {
      const { getByTestId } = render(
        <InvoiceTotals
          subtotal={6000}
          taxAmount={600}
          total={6600}
          currency={CurrencyCode.USD}
          mode="invoice"
        />
      )

      expect(getByTestId('subtotal-amount')).toHaveTextContent(
        '$60.00'
      )
      expect(getByTestId('tax-amount')).toHaveTextContent('$6.00')
      expect(getByTestId('total-amount')).toHaveTextContent('$66.00')
      expect(getByTestId('amount-due')).toHaveTextContent('$66.00')
    })

    it('should display correct payment information for receipt mode', () => {
      const { getByTestId } = render(
        <InvoiceTotals
          subtotal={6000}
          taxAmount={600}
          total={6600}
          currency={CurrencyCode.USD}
          mode="receipt"
          payment={payment}
        />
      )

      expect(getByTestId('amount-paid')).toHaveTextContent('$60.00')
    })

    it('should display refund information when payment is refunded', () => {
      const refundedPayment = createMockPayment({
        invoiceId: invoice.id,
        amount: 6000,
        status: PaymentStatus.Refunded,
        customerId: customer.id,
        organizationId: organization.id,
        refunded: true,
        refundedAmount: 6000,
        refundedAt: Date.now(),
      })

      const { getByTestId } = render(
        <InvoiceTotals
          subtotal={6000}
          taxAmount={600}
          total={6600}
          currency={CurrencyCode.USD}
          mode="receipt"
          payment={refundedPayment}
        />
      )

      expect(getByTestId('amount-paid')).toHaveTextContent('$60.00')
      expect(getByTestId('refunded-amount')).toHaveTextContent(
        '$60.00'
      )
      expect(getByTestId('total-refunded')).toHaveTextContent(
        '$60.00'
      )
    })
  })

  describe('PaymentInfo', () => {
    it('should display correct due date and amount for invoice mode', () => {
      const { getByTestId } = render(
        <PaymentInfo
          invoice={invoice}
          total={6600}
          mode="invoice"
          paymentLink="/pay"
        />
      )

      const formattedDueDate = formatDate(invoice.dueDate!)
      expect(
        getByTestId('amount-due-with-due-date')
      ).toHaveTextContent(`$66.00 due ${formattedDueDate}`)
      expect(getByTestId('pay-online-link')).toHaveTextContent(
        'Pay online'
      )
    })

    it('should display correct payment information for receipt mode', () => {
      const { getByTestId } = render(
        <PaymentInfo
          invoice={invoice}
          total={6600}
          mode="receipt"
          payment={payment}
        />
      )

      const formattedDate = formatDate(payment.chargeDate)
      expect(getByTestId('payment-amount-date')).toHaveTextContent(
        `$60.00 paid on ${formattedDate}`
      )
    })
  })

  describe('InvoiceLineItems', () => {
    it('should display line items with correct quantities and prices', () => {
      const { getAllByTestId } = render(
        <InvoiceLineItems
          lineItems={invoiceLineItems}
          currency={CurrencyCode.USD}
        />
      )

      const descriptions = getAllByTestId('line-item-description')
      const quantities = getAllByTestId('line-item-quantity')
      const prices = getAllByTestId('line-item-price')
      const amounts = getAllByTestId('line-item-amount-column')

      // First line item: 2 × $25.00 = $50.00
      expect(descriptions[0]).toHaveTextContent('Test Description')
      expect(quantities[0]).toHaveTextContent('2')
      expect(prices[0]).toHaveTextContent('$25.00')
      expect(amounts[0]).toHaveTextContent('$50.00')

      // Second line item: 1 × $10.00 = $10.00
      expect(descriptions[1]).toHaveTextContent('Test Description')
      expect(quantities[1]).toHaveTextContent('1')
      expect(prices[1]).toHaveTextContent('$10.00')
      expect(amounts[1]).toHaveTextContent('$10.00')
    })
  })

  describe('BillingInfo', () => {
    it('should display organization and customer billing information', () => {
      const { getByTestId } = render(
        <BillingInfo
          organization={organization}
          customer={customer}
          billingAddress={customer.billingAddress!}
        />
      )

      expect(
        getByTestId('seller-contact-info-name')
      ).toHaveTextContent(organization.name)
      expect(getByTestId('bill-to-label')).toHaveTextContent(
        'Bill to'
      )
      expect(getByTestId('customer-name')).toHaveTextContent(
        customer.name
      )
      expect(getByTestId('customer-email')).toHaveTextContent(
        customer.email
      )
    })
  })

  describe('InvoiceTemplate with discounts', () => {
    it('should handle fixed discount correctly', () => {
      const invoiceWithDiscount = createMockInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Draft,
        subtotal: 5000, // $50.00 after $10.00 discount
      })

      const { getByTestId } = render(
        <InvoiceTemplate
          invoice={invoiceWithDiscount}
          invoiceLineItems={invoiceLineItems}
          customer={customer}
          organization={organization}
          paymentLink="/pay"
          discountInfo={{
            discountName: 'Fixed Discount',
            discountCode: 'SAVE10',
            discountAmount: 1000, // $10.00 fixed discount
            discountAmountType: 'fixed',
          }}
        />
      )

      // Should show original amount ($60.00)
      expect(getByTestId('original-amount')).toHaveTextContent(
        '$60.00'
      )
      // Should show discount amount ($10.00)
      expect(getByTestId('discount-amount')).toHaveTextContent(
        '-$10.00'
      )
      // Should show subtotal ($50.00)
      expect(getByTestId('subtotal-amount')).toHaveTextContent(
        '$50.00'
      )
      // Should show total ($50.00)
      expect(getByTestId('total-amount')).toHaveTextContent('$50.00')
    })

    it('should handle percentage discount correctly', () => {
      const invoiceWithDiscount = createMockInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Draft,
        subtotal: 5400, // $54.00 after 10% discount
      })

      const { getByTestId } = render(
        <InvoiceTemplate
          invoice={invoiceWithDiscount}
          invoiceLineItems={invoiceLineItems}
          customer={customer}
          organization={organization}
          paymentLink="/pay"
          discountInfo={{
            discountName: 'Percentage Discount',
            discountCode: 'SAVE10',
            discountAmount: 10, // 10% discount
            discountAmountType: 'percent',
          }}
        />
      )

      // Should show original amount ($60.00)
      expect(getByTestId('original-amount')).toHaveTextContent(
        '$60.00'
      )
      // Should show discount amount ($6.00 - 10% of $60.00)
      expect(getByTestId('discount-amount')).toHaveTextContent(
        '-$6.00'
      )
      // Should show subtotal ($54.00)
      expect(getByTestId('subtotal-amount')).toHaveTextContent(
        '$54.00'
      )
      // Should show total ($54.00)
      expect(getByTestId('total-amount')).toHaveTextContent('$54.00')
    })

    it('should handle percentage discount with tax correctly', () => {
      const invoiceWithDiscountAndTax = createMockInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Draft,
        subtotal: 5400, // $54.00 after 10% discount
        taxAmount: 540, // $5.40 tax
      })

      const { getByTestId } = render(
        <InvoiceTemplate
          invoice={invoiceWithDiscountAndTax}
          invoiceLineItems={invoiceLineItems}
          customer={customer}
          organization={organization}
          paymentLink="/pay"
          discountInfo={{
            discountName: 'Percentage Discount',
            discountCode: 'SAVE10',
            discountAmount: 10, // 10% discount
            discountAmountType: 'percent',
          }}
        />
      )

      // Should show original amount ($60.00)
      expect(getByTestId('original-amount')).toHaveTextContent(
        '$60.00'
      )
      // Should show discount amount ($6.00)
      expect(getByTestId('discount-amount')).toHaveTextContent(
        '-$6.00'
      )
      // Should show subtotal ($54.00)
      expect(getByTestId('subtotal-amount')).toHaveTextContent(
        '$54.00'
      )
      // Should show tax ($5.40)
      expect(getByTestId('tax-amount')).toHaveTextContent('$5.40')
      // Should show total ($59.40)
      expect(getByTestId('total-amount')).toHaveTextContent('$59.40')
    })

    it('should cap percentage discount at 100%', () => {
      const invoiceWithLargeDiscount = createMockInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Draft,
        subtotal: 0, // $0.00 after 100% discount
      })

      const { getByTestId } = render(
        <InvoiceTemplate
          invoice={invoiceWithLargeDiscount}
          invoiceLineItems={invoiceLineItems}
          customer={customer}
          organization={organization}
          paymentLink="/pay"
          discountInfo={{
            discountName: 'Full Discount',
            discountCode: 'FREE',
            discountAmount: 150, // 150% (should be capped at 100%)
            discountAmountType: 'percent',
          }}
        />
      )

      // Should show original amount ($60.00)
      expect(getByTestId('original-amount')).toHaveTextContent(
        '$60.00'
      )
      // Should show discount amount ($60.00 - capped at 100%)
      expect(getByTestId('discount-amount')).toHaveTextContent(
        '-$60.00'
      )
      // Should show subtotal ($0.00)
      expect(getByTestId('subtotal-amount')).toHaveTextContent(
        '$0.00'
      )
      // Should show total ($0.00)
      expect(getByTestId('total-amount')).toHaveTextContent('$0.00')
    })
  })

  describe('InvoiceTemplate', () => {
    it('should render complete invoice with all components and correct totals', () => {
      // Create customer with billing address
      const updatedCustomer = createMockCustomer({
        id: customer.id,
        organizationId: organization.id,
        billingAddress: {
          name: 'Test Customer',
          address: {
            line1: '123 Main St',
            line2: 'Apt 1',
            city: 'San Francisco',
            state: 'CA',
            postal_code: '94105',
            country: 'US',
          },
        },
      })

      const { getByTestId, getAllByTestId } = render(
        <InvoiceTemplate
          invoice={invoice}
          invoiceLineItems={invoiceLineItems}
          customer={updatedCustomer}
          organization={organization}
          paymentLink="/pay"
        />
      )

      // Verify header
      expect(getByTestId('document-title')).toHaveTextContent(
        'Invoice'
      )
      expect(getByTestId('organization-name')).toHaveTextContent(
        organization.name
      )

      // Verify invoice details
      expect(getByTestId('document-number')).toHaveTextContent(
        invoice.invoiceNumber
      )

      // Verify billing info
      expect(getByTestId('bill-to-label')).toHaveTextContent(
        'Bill to'
      )
      expect(getByTestId('customer-name')).toHaveTextContent(
        updatedCustomer.name
      )

      // Verify payment info
      const formattedDueDate = formatDate(invoice.dueDate!)
      expect(
        getByTestId('amount-due-with-due-date')
      ).toHaveTextContent(`$60.00 due ${formattedDueDate}`)

      // Verify line items
      const descriptions = getAllByTestId('line-item-description')
      const quantities = getAllByTestId('line-item-quantity')
      const prices = getAllByTestId('line-item-price')
      const amounts = getAllByTestId('line-item-amount-column')

      // First line item: 2 × $25.00 = $50.00
      expect(descriptions[0]).toHaveTextContent('Test Description')
      expect(quantities[0]).toHaveTextContent('2')
      expect(prices[0]).toHaveTextContent('$25.00')
      expect(amounts[0]).toHaveTextContent('$50.00')

      // Second line item: 1 × $10.00 = $10.00
      expect(descriptions[1]).toHaveTextContent('Test Description')
      expect(quantities[1]).toHaveTextContent('1')
      expect(prices[1]).toHaveTextContent('$10.00')
      expect(amounts[1]).toHaveTextContent('$10.00')

      // Verify totals
      expect(getByTestId('subtotal-amount')).toHaveTextContent(
        '$60.00'
      )
      expect(getByTestId('total-amount')).toHaveTextContent('$60.00')
      expect(getByTestId('amount-due')).toHaveTextContent('$60.00')
    })

    it('should handle different invoice statuses correctly', () => {
      const paidInvoice = createMockInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Paid,
        subtotal: 6000,
      })

      const { getByTestId } = render(
        <InvoiceTemplate
          invoice={paidInvoice}
          invoiceLineItems={invoiceLineItems}
          customer={customer}
          organization={organization}
          paymentLink="/pay"
        />
      )

      // Verify totals still show correctly for paid invoice
      expect(getByTestId('subtotal-amount')).toHaveTextContent(
        '$60.00'
      )
      expect(getByTestId('total-amount')).toHaveTextContent('$60.00')
    })

    it('should not render BillingInfo when customer.billingAddress is undefined', () => {
      const customerWithoutBilling = createMockCustomer({
        id: customer.id,
        organizationId: organization.id,
        billingAddress: null,
      })

      const { queryByTestId } = render(
        <InvoiceTemplate
          invoice={invoice}
          invoiceLineItems={invoiceLineItems}
          customer={customerWithoutBilling}
          organization={organization}
          paymentLink="/pay"
        />
      )

      expect(queryByTestId('bill-to-label')).toBeNull()
      expect(queryByTestId('customer-name')).toBeNull()
      expect(queryByTestId('customer-email')).toBeNull()
    })

    it('should render BillingInfo when customer.billingAddress is defined', () => {
      // Create customer with billing address
      const updatedCustomer = createMockCustomer({
        id: customer.id,
        organizationId: organization.id,
        billingAddress: {
          name: 'Test Customer',
          address: {
            line1: '123 Main St',
            line2: 'Apt 1',
            city: 'San Francisco',
            state: 'CA',
            postal_code: '94105',
            country: 'US',
          },
        },
      })

      const { getByTestId } = render(
        <InvoiceTemplate
          invoice={invoice}
          invoiceLineItems={invoiceLineItems}
          customer={updatedCustomer}
          organization={organization}
          paymentLink="/pay"
        />
      )

      expect(getByTestId('bill-to-label')).toBeInTheDocument()
      expect(getByTestId('customer-name')).toBeInTheDocument()
      expect(getByTestId('customer-email')).toBeInTheDocument()
      expect(getByTestId('address-line1')).toHaveTextContent(
        '123 Main St'
      )
      expect(getByTestId('address-city-state')).toHaveTextContent(
        'San Francisco, CA 94105'
      )
      expect(getByTestId('address-country')).toHaveTextContent('US')
    })
  })

  describe('InvoiceTemplate MoR Support', () => {
    describe('when isMoR is false (default)', () => {
      it('should display organization name as seller', () => {
        const updatedCustomer = createMockCustomer({
          id: customer.id,
          organizationId: organization.id,
          billingAddress: {
            name: 'Test Customer',
            address: {
              line1: '123 Main St',
              city: 'San Francisco',
              state: 'CA',
              postal_code: '94105',
              country: 'US',
            },
          },
        })

        const { getByTestId } = render(
          <InvoiceTemplate
            invoice={invoice}
            invoiceLineItems={invoiceLineItems}
            customer={updatedCustomer}
            organization={organization}
            paymentLink="/pay"
            isMoR={false}
          />
        )

        expect(getByTestId('organization-name')).toHaveTextContent(
          organization.name
        )
        expect(
          getByTestId('seller-contact-info-name')
        ).toHaveTextContent(organization.name)
      })
    })

    describe('when isMoR is true', () => {
      it('should display Flowglad LLC as seller with merchant info and customer billing', () => {
        const updatedCustomer = createMockCustomer({
          id: customer.id,
          organizationId: organization.id,
          billingAddress: {
            name: 'Test Customer',
            address: {
              line1: '123 Main St',
              city: 'San Francisco',
              state: 'CA',
              postal_code: '94105',
              country: 'US',
            },
          },
        })

        const { getByTestId } = render(
          <InvoiceTemplate
            invoice={invoice}
            invoiceLineItems={invoiceLineItems}
            customer={updatedCustomer}
            organization={organization}
            paymentLink="/pay"
            isMoR={true}
          />
        )

        // When isMoR=true and logo URL exists, the logo is shown with Flowglad name as alt text
        expect(getByTestId('organization-logo')).toHaveAttribute(
          'alt',
          FLOWGLAD_LEGAL_ENTITY.name
        )
        expect(
          getByTestId('seller-contact-info-name')
        ).toHaveTextContent(FLOWGLAD_LEGAL_ENTITY.name)

        // Should show "For: [org name]" in seller section
        expect(getByTestId('seller-for-merchant')).toHaveTextContent(
          `For: ${organization.name}`
        )

        // Should still display customer billing info correctly
        expect(getByTestId('bill-to-label')).toHaveTextContent(
          'Bill to'
        )
        expect(getByTestId('customer-name')).toHaveTextContent(
          updatedCustomer.name
        )
        expect(getByTestId('customer-email')).toHaveTextContent(
          updatedCustomer.email
        )
        expect(getByTestId('address-line1')).toHaveTextContent(
          '123 Main St'
        )
        expect(getByTestId('address-city-state')).toHaveTextContent(
          'San Francisco, CA 94105'
        )
      })
    })
  })

  describe('SellerContactInfo', () => {
    describe('when isMoR is false', () => {
      it('should display organization name as seller', () => {
        const { getByTestId } = render(
          <SellerContactInfo
            organization={organization}
            isMoR={false}
          />
        )

        expect(
          getByTestId('seller-contact-info-name')
        ).toHaveTextContent(organization.name)
      })
    })

    describe('when isMoR is true', () => {
      it('should display Flowglad LLC as seller', () => {
        const { getByTestId } = render(
          <SellerContactInfo
            organization={organization}
            isMoR={true}
          />
        )

        expect(
          getByTestId('seller-contact-info-name')
        ).toHaveTextContent(FLOWGLAD_LEGAL_ENTITY.name)
      })

      it('should display Flowglad address', () => {
        const { getByText } = render(
          <SellerContactInfo
            organization={organization}
            isMoR={true}
          />
        )

        expect(
          getByText(FLOWGLAD_LEGAL_ENTITY.address.line1)
        ).toBeInTheDocument()
        expect(
          getByText(FLOWGLAD_LEGAL_ENTITY.contactEmail)
        ).toBeInTheDocument()
      })

      it('should show "For: [org name]"', () => {
        const { getByTestId } = render(
          <SellerContactInfo
            organization={organization}
            isMoR={true}
          />
        )

        expect(getByTestId('seller-for-merchant')).toHaveTextContent(
          `For: ${organization.name}`
        )
      })
    })
  })

  describe('DocumentHeader MoR Support', () => {
    describe('when isMoR is false', () => {
      it('should display organization name', () => {
        const { getByTestId } = render(
          <DocumentHeader
            organization={organization}
            mode="invoice"
            isMoR={false}
          />
        )

        expect(getByTestId('organization-name')).toHaveTextContent(
          organization.name
        )
      })
    })

    describe('when isMoR is true', () => {
      it('should display Flowglad logo with "Flowglad LLC" as alt text', () => {
        const { getByTestId } = render(
          <DocumentHeader
            organization={organization}
            mode="invoice"
            isMoR={true}
          />
        )

        expect(getByTestId('organization-logo')).toHaveAttribute(
          'alt',
          FLOWGLAD_LEGAL_ENTITY.name
        )
      })
    })
  })

  describe('BillingInfo MoR Support', () => {
    describe('when isMoR is false', () => {
      it('should display organization as seller', () => {
        const { getByTestId } = render(
          <BillingInfo
            organization={organization}
            customer={customer}
            billingAddress={customer.billingAddress!}
            isMoR={false}
          />
        )

        expect(
          getByTestId('seller-contact-info-name')
        ).toHaveTextContent(organization.name)
      })
    })

    describe('when isMoR is true', () => {
      it('should display Flowglad LLC as seller', () => {
        const { getByTestId } = render(
          <BillingInfo
            organization={organization}
            customer={customer}
            billingAddress={customer.billingAddress!}
            isMoR={true}
          />
        )

        expect(
          getByTestId('seller-contact-info-name')
        ).toHaveTextContent(FLOWGLAD_LEGAL_ENTITY.name)
      })

      it('should show "For: [org name]"', () => {
        const { getByTestId } = render(
          <BillingInfo
            organization={organization}
            customer={customer}
            billingAddress={customer.billingAddress!}
            isMoR={true}
          />
        )

        expect(getByTestId('seller-for-merchant')).toHaveTextContent(
          `For: ${organization.name}`
        )
      })

      it('should display customer name and email in bill-to section', () => {
        const { getByTestId } = render(
          <BillingInfo
            organization={organization}
            customer={customer}
            billingAddress={customer.billingAddress!}
            isMoR={true}
          />
        )

        expect(getByTestId('bill-to-label')).toHaveTextContent(
          'Bill to'
        )
        expect(getByTestId('customer-name')).toHaveTextContent(
          customer.name
        )
        expect(getByTestId('customer-email')).toHaveTextContent(
          customer.email
        )
      })
    })
  })
})
