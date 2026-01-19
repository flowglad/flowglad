/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupInvoice,
  setupInvoiceLineItem,
  setupOrg,
  setupPayment,
} from '@/../seedDatabase'
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
import { ReceiptTemplate } from './receipts'

describe('Receipt Components', () => {
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
      status: InvoiceStatus.Paid,
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

  describe('ReceiptTemplate with discounts', () => {
    it('should handle fixed discount correctly', async () => {
      const invoiceWithDiscount = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Paid,
        priceId: price.id,
      })

      const paymentWithDiscount = await setupPayment({
        invoiceId: invoiceWithDiscount.id,
        amount: 5000, // $50.00
        status: PaymentStatus.Succeeded,
        customerId: customer.id,
        organizationId: organization.id,
        stripeChargeId: `ch_${Date.now()}`,
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

    it('should handle percentage discount correctly', async () => {
      const invoiceWithDiscount = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Paid,
        priceId: price.id,
      })

      const paymentWithDiscount = await setupPayment({
        invoiceId: invoiceWithDiscount.id,
        amount: 5400, // $54.00
        status: PaymentStatus.Succeeded,
        customerId: customer.id,
        organizationId: organization.id,
        stripeChargeId: `ch_${Date.now()}`,
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

    it('should handle percentage discount with tax correctly', async () => {
      const invoiceWithDiscountAndTax = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Paid,
        priceId: price.id,
      })

      // Update the invoice with the correct subtotal and tax
      const updatedInvoiceWithTax = (
        await adminTransaction(async ({ transaction }) => {
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
        })
      ).unwrap()

      const paymentWithDiscountAndTax = await setupPayment({
        invoiceId: invoiceWithDiscountAndTax.id,
        amount: 5940, // $59.40
        status: PaymentStatus.Succeeded,
        customerId: customer.id,
        organizationId: organization.id,
        stripeChargeId: `ch_${Date.now()}`,
      })

      const { getByTestId } = render(
        <ReceiptTemplate
          invoice={updatedInvoiceWithTax}
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

    it('should cap percentage discount at 100%', async () => {
      const invoiceWithLargeDiscount = await setupInvoice({
        customerId: customer.id,
        organizationId: organization.id,
        status: InvoiceStatus.Paid,
        priceId: price.id,
      })

      const paymentWithLargeDiscount = await setupPayment({
        invoiceId: invoiceWithLargeDiscount.id,
        amount: 0, // $0.00
        status: PaymentStatus.Succeeded,
        customerId: customer.id,
        organizationId: organization.id,
        stripeChargeId: `ch_${Date.now()}`,
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
