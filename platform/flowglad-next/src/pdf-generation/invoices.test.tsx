import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupInvoice,
  setupInvoiceLineItem,
  setupOrg,
  setupPayment,
} from '@/../seedDatabase'
import { FLOWGLAD_LEGAL_ENTITY } from '@/constants/mor'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import type { Invoice } from '@/db/schema/invoices'
import type { Organization } from '@/db/schema/organizations'
import type { Payment } from '@/db/schema/payments'
import type { Price } from '@/db/schema/prices'
import { updateCustomer } from '@/db/tableMethods/customerMethods'
import { updateInvoice } from '@/db/tableMethods/invoiceMethods'
import { CurrencyCode, InvoiceStatus, PaymentStatus } from '@/types'
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
      await setupInvoiceLineItem({
        invoiceId: invoice.id,
        priceId: orgSetup.price.id,
        quantity: 1,
        price: 1000, // $10.00
      }),
    ]

    payment = await setupPayment({
      invoiceId: invoice.id,
      amount: 6000, // $60.00
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

    it('should display refund information when payment is refunded', async () => {
      const refundedPayment = await setupPayment({
        invoiceId: invoice.id,
        amount: 6000,
        status: PaymentStatus.Refunded,
        customerId: customer.id,
        organizationId: organization.id,
        stripeChargeId: `ch_${Date.now()}`,
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
    it('should handle fixed discount correctly', async () => {
      const invoiceWithDiscount = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Draft,
        priceId: price.id,
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

    it('should handle percentage discount correctly', async () => {
      const invoiceWithDiscount = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Draft,
        priceId: price.id,
      })

      // Update the invoice with the correct subtotal
      await adminTransaction(async ({ transaction }) => {
        return await updateInvoice(
          {
            id: invoiceWithDiscount.id,
            type: invoiceWithDiscount.type,
            purchaseId: invoiceWithDiscount.purchaseId,
            billingPeriodId: invoiceWithDiscount.billingPeriodId,
            subscriptionId: invoiceWithDiscount.subscriptionId,
            subtotal: 5400, // $54.00 after 10% discount
          } as any,
          transaction
        )
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

    it('should handle percentage discount with tax correctly', async () => {
      const invoiceWithDiscountAndTax = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Draft,
        priceId: price.id,
      })

      // Update the invoice with the correct subtotal and tax
      const updatedInvoiceWithTax = await adminTransaction(
        async ({ transaction }) => {
          return await updateInvoice(
            {
              id: invoiceWithDiscountAndTax.id,
              type: invoiceWithDiscountAndTax.type,
              purchaseId: invoiceWithDiscountAndTax.purchaseId,
              billingPeriodId:
                invoiceWithDiscountAndTax.billingPeriodId,
              subscriptionId:
                invoiceWithDiscountAndTax.subscriptionId,
              subtotal: 5400, // $54.00 after 10% discount
              taxAmount: 540, // $5.40 tax
            } as any,
            transaction
          )
        }
      )

      const { getByTestId } = render(
        <InvoiceTemplate
          invoice={updatedInvoiceWithTax}
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

    it('should cap percentage discount at 100%', async () => {
      const invoiceWithLargeDiscount = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Draft,
        priceId: price.id,
      })

      // Update the invoice with the correct subtotal
      await adminTransaction(async ({ transaction }) => {
        return await updateInvoice(
          {
            id: invoiceWithLargeDiscount.id,
            type: invoiceWithLargeDiscount.type,
            purchaseId: invoiceWithLargeDiscount.purchaseId,
            billingPeriodId: invoiceWithLargeDiscount.billingPeriodId,
            subscriptionId: invoiceWithLargeDiscount.subscriptionId,
            subtotal: 0, // $0.00 after 100% discount
          } as any,
          transaction
        )
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
        customer.name
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
        '$60.00'
      )
      expect(getByTestId('total-amount')).toHaveTextContent('$60.00')
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

  describe('InvoiceTemplate MoR Support', () => {
    describe('when isMoR is false (default)', () => {
      it('should display organization name as seller', async () => {
        const updatedCustomer = await adminTransaction(
          async ({ transaction }) => {
            return await updateCustomer(
              {
                id: customer.id,
                billingAddress: {
                  address: {
                    line1: '123 Main St',
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
      it('should display Flowglad LLC as seller', async () => {
        const updatedCustomer = await adminTransaction(
          async ({ transaction }) => {
            return await updateCustomer(
              {
                id: customer.id,
                billingAddress: {
                  address: {
                    line1: '123 Main St',
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
      })

      it('should show "For: [org name]" in seller section', async () => {
        const updatedCustomer = await adminTransaction(
          async ({ transaction }) => {
            return await updateCustomer(
              {
                id: customer.id,
                billingAddress: {
                  address: {
                    line1: '123 Main St',
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
            isMoR={true}
          />
        )

        expect(getByTestId('seller-for-merchant')).toHaveTextContent(
          `For: ${organization.name}`
        )
      })

      it('should still display customer billing info correctly', async () => {
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
            isMoR={true}
          />
        )

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
      it('should display Flowglad logo with correct alt text', () => {
        const { getByTestId } = render(
          <DocumentHeader
            organization={organization}
            mode="invoice"
            isMoR={true}
          />
        )

        // When isMoR=true and logo URL exists, the logo is shown with Flowglad name as alt text
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

      it('should still show customer billing info correctly', () => {
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
