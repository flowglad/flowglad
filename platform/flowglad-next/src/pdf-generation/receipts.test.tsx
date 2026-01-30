import { beforeEach, describe, expect, it } from 'bun:test'
import { InvoiceStatus, PaymentStatus } from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import type { InvoiceLineItem } from '@db-core/schema/invoiceLineItems'
import type { Invoice } from '@db-core/schema/invoices'
import type { Organization } from '@db-core/schema/organizations'
import { render } from '@testing-library/react'
import { ReceiptTemplate } from './receipts'
import {
  createMockCustomer,
  createMockInvoice,
  createMockInvoiceLineItem,
  createMockOrganization,
  createMockPayment,
  resetMockIdCounter,
} from './test/pdfMocks'

// ============================================================================
// Tests
// ============================================================================

describe('Receipt Components', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let invoice: Invoice.Record
  let invoiceLineItems: InvoiceLineItem.Record[]

  beforeEach(() => {
    // Reset counter for each test to ensure consistent IDs
    resetMockIdCounter()

    // Setup test data with mock factories
    organization = createMockOrganization()
    customer = createMockCustomer({ organizationId: organization.id })
    invoice = createMockInvoice({
      customerId: customer.id,
      organizationId: organization.id,
      status: InvoiceStatus.Paid,
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
  })

  describe('ReceiptTemplate with discounts', () => {
    it('should handle fixed discount correctly', () => {
      const invoiceWithDiscount = createMockInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Paid,
        subtotal: 5000, // $50.00 after $10.00 discount
      })

      const paymentWithDiscount = createMockPayment({
        invoiceId: invoiceWithDiscount.id,
        amount: 5000, // $50.00
        status: PaymentStatus.Succeeded,
        customerId: customer.id,
        organizationId: organization.id,
      })

      const { getByTestId } = render(
        <ReceiptTemplate
          invoice={invoiceWithDiscount}
          invoiceLineItems={invoiceLineItems}
          customer={customer}
          organization={organization}
          paymentDataItems={[
            {
              payment: paymentWithDiscount,
              paymentMethod: null,
            },
          ]}
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
      // Should show amount paid ($50.00)
      expect(getByTestId('amount-paid')).toHaveTextContent('$50.00')
    })

    it('should handle percentage discount correctly', () => {
      const invoiceWithDiscount = createMockInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Paid,
        subtotal: 5400, // $54.00 after 10% discount
      })

      const paymentWithDiscount = createMockPayment({
        invoiceId: invoiceWithDiscount.id,
        amount: 5400, // $54.00
        status: PaymentStatus.Succeeded,
        customerId: customer.id,
        organizationId: organization.id,
      })

      const { getByTestId } = render(
        <ReceiptTemplate
          invoice={invoiceWithDiscount}
          invoiceLineItems={invoiceLineItems}
          customer={customer}
          organization={organization}
          paymentDataItems={[
            {
              payment: paymentWithDiscount,
              paymentMethod: null,
            },
          ]}
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
      // Should show amount paid ($54.00)
      expect(getByTestId('amount-paid')).toHaveTextContent('$54.00')
    })

    it('should handle percentage discount with tax correctly', () => {
      const invoiceWithDiscountAndTax = createMockInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Paid,
        subtotal: 5400, // $54.00 after 10% discount
        taxAmount: 540, // $5.40 tax
      })

      const paymentWithDiscountAndTax = createMockPayment({
        invoiceId: invoiceWithDiscountAndTax.id,
        amount: 5940, // $59.40
        status: PaymentStatus.Succeeded,
        customerId: customer.id,
        organizationId: organization.id,
      })

      const { getByTestId } = render(
        <ReceiptTemplate
          invoice={invoiceWithDiscountAndTax}
          invoiceLineItems={invoiceLineItems}
          customer={customer}
          organization={organization}
          paymentDataItems={[
            {
              payment: paymentWithDiscountAndTax,
              paymentMethod: null,
            },
          ]}
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
      // Should show amount paid ($59.40)
      expect(getByTestId('amount-paid')).toHaveTextContent('$59.40')
    })

    it('should cap percentage discount at 100%', () => {
      const invoiceWithLargeDiscount = createMockInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Paid,
        subtotal: 0, // $0.00 after 100% discount
      })

      const paymentWithLargeDiscount = createMockPayment({
        invoiceId: invoiceWithLargeDiscount.id,
        amount: 0, // $0.00
        status: PaymentStatus.Succeeded,
        customerId: customer.id,
        organizationId: organization.id,
      })

      const { getByTestId } = render(
        <ReceiptTemplate
          invoice={invoiceWithLargeDiscount}
          invoiceLineItems={invoiceLineItems}
          customer={customer}
          organization={organization}
          paymentDataItems={[
            {
              payment: paymentWithLargeDiscount,
              paymentMethod: null,
            },
          ]}
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
      // Should show amount paid ($0.00)
      expect(getByTestId('amount-paid')).toHaveTextContent('$0.00')
    })
  })
})
