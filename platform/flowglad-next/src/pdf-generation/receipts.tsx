import React from 'react'
import { Container, Head, Body, Html } from '@react-email/components'
import {
  DocumentHeader,
  DocumentDetails,
  BillingInfo,
  PaymentInfo,
  InvoiceLineItems,
  InvoiceTotals,
  InvoiceFooter,
  InvoiceTemplateProps,
} from '@/pdf-generation/invoices'

export const ReceiptTemplate: React.FC<InvoiceTemplateProps> = ({
  invoice,
  invoiceLineItems,
  customerProfile,
  organization,
  paymentDataItems = [],
}) => {
  const paymentData =
    paymentDataItems.length > 0 ? paymentDataItems[0] : undefined
  if (!paymentData) {
    throw new Error('No payment data items provided')
  }
  const subtotal = invoice.subtotal ?? 0
  const taxAmount = invoice.taxAmount || 0
  const total = subtotal + taxAmount
  const billingAddress = customerProfile.billingAddress

  return (
    <Html>
      <Head>
        <title>Receipt #{paymentData.payment.id}</title>
        <style>
          {`
              body { 
                  font-family: 'Inter', sans-serif; 
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
              customerProfile={customerProfile}
              billingAddress={billingAddress}
            />
          )}
          <PaymentInfo
            invoice={invoice}
            total={total}
            mode="receipt"
            payment={paymentData.payment}
          />
          <InvoiceLineItems lineItems={invoiceLineItems} />
          <InvoiceTotals
            subtotal={subtotal}
            taxAmount={taxAmount}
            total={total}
            currency={invoice.currency}
            mode="receipt"
            payment={paymentData.payment}
          />
          <InvoiceFooter organization={organization} />
        </Container>
      </Body>
    </Html>
  )
}
