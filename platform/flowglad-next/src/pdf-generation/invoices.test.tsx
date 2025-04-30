import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { InvoiceTemplate } from './invoices'
import { InvoiceTotals } from './invoices'
import { PaymentInfo } from './invoices'
import { InvoiceLineItems } from './invoices'
import { BillingInfo } from './invoices'
import {
  setupOrg,
  setupCustomer,
  setupInvoice,
  setupInvoiceLineItem,
  setupPayment,
} from '@/../seedDatabase'
import { InvoiceStatus, PaymentStatus, CurrencyCode } from '@/types'
import { formatDate } from '@/utils/core'
import { Organization } from '@/db/schema/organizations'
import { Customer } from '@/db/schema/customers'
import { Invoice } from '@/db/schema/invoices'
import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import { Payment } from '@/db/schema/payments'
import { Price } from '@/db/schema/prices'
import { adminTransaction } from '@/db/adminTransaction'
import { updateCustomer } from '@/db/tableMethods/customerMethods'

describe('Invoice Components', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let invoice: Invoice.Record
  let invoiceLineItems: InvoiceLineItem.Record[]
  let payment: Payment.Record
  let price: Price.Record

  beforeEach(async () => {
    // Setup test data
    const orgSetup = await setupOrg()
    organization = orgSetup.organization
    price = orgSetup.price

    customer = await setupCustomer({
      organizationId: organization.id,
      stripeCustomerId: `cus_${Date.now()}`,
    })

    invoice = await setupInvoice({
      customerId: customer.id,
      organizationId: organization.id,
      status: InvoiceStatus.Draft,
      priceId: orgSetup.price.id,
    })

    invoiceLineItems = [
      await setupInvoiceLineItem({
        invoiceId: invoice.id,
        priceId: orgSetup.price.id,
        quantity: 2,
        price: 2500, // $25.00
      }),
    ]

    payment = await setupPayment({
      invoiceId: invoice.id,
      amount: 5000, // $50.00
      status: PaymentStatus.Succeeded,
      customerId: customer.id,
      organizationId: organization.id,
      stripeChargeId: `ch_${Date.now()}`,
    })
  })

  describe('InvoiceTotals', () => {
    it('should display correct subtotal, tax, and total for invoice mode', () => {
      const { getByTestId } = render(
        <InvoiceTotals
          subtotal={5000}
          taxAmount={500}
          total={5500}
          currency={CurrencyCode.USD}
          mode="invoice"
        />
      )

      expect(getByTestId('subtotal-amount')).toHaveTextContent(
        '$50.00'
      )
      expect(getByTestId('tax-amount')).toHaveTextContent('$5.00')
      expect(getByTestId('total-amount')).toHaveTextContent('$55.00')
      expect(getByTestId('amount-due')).toHaveTextContent('$55.00')
    })

    it('should display correct payment information for receipt mode', () => {
      const { getByTestId } = render(
        <InvoiceTotals
          subtotal={5000}
          taxAmount={500}
          total={5500}
          currency={CurrencyCode.USD}
          mode="receipt"
          payment={payment}
        />
      )

      expect(getByTestId('amount-paid')).toHaveTextContent('$50.00')
    })

    it('should display refund information when payment is refunded', async () => {
      const refundedPayment = await setupPayment({
        invoiceId: invoice.id,
        amount: 5000,
        status: PaymentStatus.Refunded,
        customerId: customer.id,
        organizationId: organization.id,
        stripeChargeId: `ch_${Date.now()}`,
        refunded: true,
        refundedAmount: 5000,
        refundedAt: new Date(),
      })

      const { getByTestId } = render(
        <InvoiceTotals
          subtotal={5000}
          taxAmount={500}
          total={5500}
          currency={CurrencyCode.USD}
          mode="receipt"
          payment={refundedPayment}
        />
      )

      expect(getByTestId('amount-paid')).toHaveTextContent('$50.00')
      expect(getByTestId('refunded-amount')).toHaveTextContent(
        '$50.00'
      )
      expect(getByTestId('total-refunded')).toHaveTextContent(
        '$50.00'
      )
    })
  })

  describe('PaymentInfo', () => {
    it('should display correct due date and amount for invoice mode', () => {
      const { getByTestId } = render(
        <PaymentInfo
          invoice={invoice}
          total={5500}
          mode="invoice"
          paymentLink="/pay"
        />
      )

      const formattedDueDate = formatDate(invoice.dueDate!)
      expect(
        getByTestId('amount-due-with-due-date')
      ).toHaveTextContent(`$55.00 due ${formattedDueDate}`)
      expect(getByTestId('pay-online-link')).toHaveTextContent(
        'Pay online'
      )
    })

    it('should display correct payment information for receipt mode', () => {
      const { getByTestId } = render(
        <PaymentInfo
          invoice={invoice}
          total={5500}
          mode="receipt"
          payment={payment}
        />
      )

      const formattedDate = formatDate(payment.chargeDate)
      expect(getByTestId('payment-amount-date')).toHaveTextContent(
        `$50.00 paid on ${formattedDate}`
      )
    })
  })

  describe('InvoiceLineItems', () => {
    it('should display line items with correct quantities and prices', () => {
      const { getByTestId } = render(
        <InvoiceLineItems
          lineItems={invoiceLineItems}
          currency={CurrencyCode.USD}
        />
      )

      expect(getByTestId('line-item-description')).toHaveTextContent(
        'Test Description'
      )
      expect(getByTestId('line-item-quantity')).toHaveTextContent('2')
      expect(getByTestId('line-item-price')).toHaveTextContent(
        '$25.00'
      )
      expect(
        getByTestId('line-item-amount-column')
      ).toHaveTextContent('$50.00')
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
        getByTestId('organization-contact-info-name')
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

  describe('InvoiceTemplate', () => {
    it('should render complete invoice with all components and correct totals', async () => {
      // Update customer with billing address
      const updatedCustomer = await adminTransaction(
        async ({ transaction }) => {
          return await updateCustomer(
            {
              id: customer.id,
              billingAddress: {
                address: {
                  line1: '123 Main St',
                  line2: 'Apt 1',
                  city: 'San Francisco',
                  state: 'CA',
                  postal_code: '94105',
                  country: 'US',
                },
              },
            },
            transaction
          )
        }
      )

      const { getByTestId } = render(
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
        customer.name
      )

      // Verify payment info
      const formattedDueDate = formatDate(invoice.dueDate!)
      expect(
        getByTestId('amount-due-with-due-date')
      ).toHaveTextContent(`$50.00 due ${formattedDueDate}`)

      // Verify line items
      expect(getByTestId('line-item-description')).toHaveTextContent(
        'Test Description'
      )
      expect(getByTestId('line-item-quantity')).toHaveTextContent('2')
      expect(getByTestId('line-item-price')).toHaveTextContent(
        '$25.00'
      )
      expect(
        getByTestId('line-item-amount-column')
      ).toHaveTextContent('$50.00')

      // Verify totals
      expect(getByTestId('subtotal-amount')).toHaveTextContent(
        '$50.00'
      )
      expect(getByTestId('total-amount')).toHaveTextContent('$50.00')
      expect(getByTestId('amount-due')).toHaveTextContent('$50.00')
    })

    it('should handle different invoice statuses correctly', async () => {
      const paidInvoice = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Paid,
        priceId: price.id,
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
        '$50.00'
      )
      expect(getByTestId('total-amount')).toHaveTextContent('$50.00')
    })

    it('should not render BillingInfo when customer.billingAddress is undefined', () => {
      const { queryByTestId } = render(
        <InvoiceTemplate
          invoice={invoice}
          invoiceLineItems={invoiceLineItems}
          customer={customer}
          organization={organization}
          paymentLink="/pay"
        />
      )

      expect(queryByTestId('bill-to-label')).toBeNull()
      expect(queryByTestId('customer-name')).toBeNull()
      expect(queryByTestId('customer-email')).toBeNull()
    })

    it('should render BillingInfo when customer.billingAddress is defined', async () => {
      // Update customer with billing address
      const updatedCustomer = await adminTransaction(
        async ({ transaction }) => {
          return await updateCustomer(
            {
              id: customer.id,
              billingAddress: {
                address: {
                  line1: '123 Main St',
                  line2: 'Apt 1',
                  city: 'San Francisco',
                  state: 'CA',
                  postal_code: '94105',
                  country: 'US',
                },
              },
            },
            transaction
          )
        }
      )

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
})
