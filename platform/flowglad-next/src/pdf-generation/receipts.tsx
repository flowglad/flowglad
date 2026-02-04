import { Body, Container, Head, Html } from '@react-email/components'
import type React from 'react'
import { panic } from '@/errors'
import {
  BillingInfo,
  DocumentDetails,
  DocumentHeader,
  InvoiceFooter,
  InvoiceLineItems,
  type InvoiceTemplateProps,
  InvoiceTotals,
  PaymentInfo,
} from '@/pdf-generation/invoices'
import { calculateInvoiceTotalsRaw } from '@/utils/discountHelpers'

export const ReceiptTemplate: React.FC<InvoiceTemplateProps> = ({
  invoice,
  invoiceLineItems,
  customer,
  organization,
  paymentDataItems = [],
  discountInfo,
}) => {
  const paymentData =
    paymentDataItems.length > 0 ? paymentDataItems[0] : undefined
  if (!paymentData) {
    panic('No payment data items provided')
  }
  const totals = calculateInvoiceTotalsRaw(
    invoiceLineItems,
    invoice,
    discountInfo
  )
  const billingAddress = customer.billingAddress

  return (
    <Html>
      <Head>
        <title>Receipt #{paymentData.payment.id}</title>
        <style>
          {`
              body { 
                  font-family: 'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif; 
                  color: #333; 
                  line-height: 1.4;
                  margin: 0;
                  padding: 0;
                }
                .invoice-table { 
                  width: 100%; 
                  border-collapse: collapse; 
                  margin: 20px 0; 
                }
                .invoice-table th, .invoice-table td { 
                  padding: 10px; 
                  text-align: left; 
                  border-bottom: 1px solid #eee; 
                }
                .invoice-table th { 
                  background-color: #f8f8f8; 
                  font-weight: 500;
                }
                .amount-column, .qty-column, .price-column { 
                  text-align: right; 
                }
                .invoice-total-row {
                  font-weight: normal;
                  border-top: 1px solid #eee;
                }
                .invoice-final-row {
                  font-weight: bold;
                }
            `}
        </style>
      </Head>
      <Body
        style={{
          margin: 0,
          padding: '40px 20px',
          backgroundColor: '#ffffff',
        }}
      >
        <Container
          style={{
            width: '100%',
            maxWidth: '800px',
            margin: '0 auto',
          }}
        >
          <DocumentHeader
            organization={organization}
            mode="receipt"
          />
          <DocumentDetails
            invoice={invoice}
            mode="receipt"
            paymentData={paymentData}
          />
          {billingAddress && (
            <BillingInfo
              organization={organization}
              customer={customer}
              billingAddress={billingAddress}
            />
          )}
          <PaymentInfo
            invoice={invoice}
            total={totals.total}
            mode="receipt"
            payment={paymentData.payment}
          />
          <InvoiceLineItems
            lineItems={invoiceLineItems}
            currency={invoice.currency}
          />
          <InvoiceTotals
            subtotal={totals.subtotal}
            taxAmount={totals.taxAmount}
            total={totals.total}
            currency={invoice.currency}
            mode="receipt"
            payment={paymentData.payment}
            originalAmount={totals.baseAmount}
            discountInfo={
              discountInfo
                ? {
                    ...discountInfo,
                    currency: invoice.currency,
                  }
                : null
            }
          />
          <InvoiceFooter organization={organization} />
        </Container>
      </Body>
    </Html>
  )
}
