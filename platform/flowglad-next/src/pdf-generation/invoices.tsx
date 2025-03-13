import React from 'react'
import {
  Section,
  Text,
  Row,
  Column,
  Img,
  Container,
  Head,
  Body,
  Html,
  Link,
} from '@react-email/components'
import { Organization } from '@/db/schema/organizations'
import { Invoice } from '@/db/schema/invoices'
import { Payment } from '@/db/schema/payments'
import { CustomerProfile } from '@/db/schema/customerProfiles'
import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import { formatCurrency, formatDate, titleCase } from '@/utils/core'
import { BillingAddress } from '@/db/schema/customers'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { paymentMethodSummaryLabel } from '@/utils/paymentMethodHelpers'
import { PaymentAndPaymentMethod } from '@/db/tableMethods/paymentMethods'
/**
 * Use the
 * @param paymentMethod
 * @returns
 */
const safePaymentMethodSummaryLabel = (
  paymentData: PaymentAndPaymentMethod
) => {
  return paymentData.paymentMethod
    ? paymentMethodSummaryLabel(paymentData.paymentMethod)
    : titleCase(paymentData.payment.paymentMethod)
}

interface DocumentHeaderProps {
  organization: Organization.Record
  mode: 'receipt' | 'invoice'
}

export const DocumentHeader: React.FC<DocumentHeaderProps> = ({
  organization,
  mode,
}) => {
  return (
    <Row style={{ marginBottom: '20px' }}>
      <Column style={{ width: '70%' }}>
        <Text
          style={{
            fontSize: '32px',
            fontWeight: '700',
            margin: '0 0 5px 0',
            color: '#000',
          }}
        >
          {mode === 'receipt' ? 'Receipt' : 'Invoice'}
        </Text>
      </Column>
      <Column
        style={{
          width: '100%',
          textAlign: 'right',
          justifyContent: 'flex-end',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
        }}
      >
        {organization.logoURL ? (
          <Img
            src={organization.logoURL}
            alt={`${organization.name}`}
            width="64"
            height="64"
            style={{ marginLeft: 'auto' }}
          />
        ) : (
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {organization.name}
          </Text>
        )}
      </Column>
    </Row>
  )
}

interface DocumentDetailsProps {
  invoice: Invoice.Record
  mode: 'receipt' | 'invoice'
  paymentData?: {
    payment: Payment.Record
    paymentMethod: PaymentMethod.Record | null
  }
}

export const DocumentDetails: React.FC<DocumentDetailsProps> = ({
  invoice,
  mode,
  paymentData,
}) => {
  const formattedInvoiceDate = formatDate(invoice.invoiceDate)
  const formattedDueDate = invoice.dueDate
    ? formatDate(invoice.dueDate)
    : 'Due upon receipt'

  return (
    <Row style={{ marginBottom: '30px' }}>
      <Column>
        <Text style={{ margin: '0', fontWeight: 'normal' }}>
          <span style={{ display: 'inline-block', width: '150px' }}>
            {mode === 'receipt' ? 'Receipt number' : 'Invoice number'}
          </span>
          {mode === 'receipt' && paymentData
            ? paymentData.payment.id
            : invoice.invoiceNumber}
        </Text>
        <Text style={{ margin: '5px 0', fontWeight: 'normal' }}>
          <span style={{ display: 'inline-block', width: '150px' }}>
            {mode === 'receipt' ? 'Date paid' : 'Date of issue'}
          </span>
          {mode === 'receipt' && paymentData
            ? formatDate(paymentData.payment.chargeDate)
            : formattedInvoiceDate}
        </Text>
        {mode === 'receipt' && paymentData && (
          <Text style={{ margin: '5px 0', fontWeight: 'normal' }}>
            <span style={{ display: 'inline-block', width: '150px' }}>
              Payment method
            </span>
            {safePaymentMethodSummaryLabel(paymentData)}
          </Text>
        )}
        {mode === 'invoice' && (
          <Text style={{ margin: '5px 0', fontWeight: 'normal' }}>
            <span style={{ display: 'inline-block', width: '150px' }}>
              Date due
            </span>
            {formattedDueDate}
          </Text>
        )}
      </Column>
    </Row>
  )
}

interface BillingInfoProps {
  organization: Organization.Record
  customerProfile: CustomerProfile.Record
  billingAddress?: BillingAddress
}

const BillingAddressLabel: React.FC<{
  billingAddress: BillingAddress
}> = ({ billingAddress }) => {
  return (
    <>
      <Text style={{ margin: '0' }}>
        {billingAddress.address.line1}
      </Text>
      <Text style={{ margin: '0' }}>
        {billingAddress.address.city}, {billingAddress.address.state}{' '}
        {billingAddress.address.postal_code}
      </Text>
      <Text style={{ margin: '0' }}>
        {billingAddress.address.country}
      </Text>
    </>
  )
}

const OrganizationContactInfo: React.FC<{
  organization: Organization.Record
}> = ({ organization }) => {
  return (
    <>
      <Text style={{ fontWeight: 'bold', margin: '0 0 5px 0' }}>
        {organization.name}
      </Text>
      {organization.billingAddress && (
        <BillingAddressLabel
          billingAddress={organization.billingAddress}
        />
      )}
      {organization.contactEmail && (
        <Text style={{ margin: '0' }}>
          {organization.contactEmail}
        </Text>
      )}
    </>
  )
}

export const BillingInfo: React.FC<BillingInfoProps> = ({
  organization,
  customerProfile,
  billingAddress,
}) => {
  return (
    <Row style={{ marginBottom: '30px' }}>
      <Column
        style={{
          width: '50%',
          paddingRight: '15px',
          verticalAlign: 'top',
        }}
      >
        <OrganizationContactInfo organization={organization} />
      </Column>

      <Column
        style={{
          width: '50%',
          paddingLeft: '15px',
          verticalAlign: 'top',
        }}
      >
        <Text style={{ fontWeight: 'bold', margin: '0 0 5px 0' }}>
          Bill to
        </Text>
        <Text style={{ margin: '0' }}>{customerProfile.name}</Text>
        {billingAddress && (
          <>
            <Text style={{ margin: '0' }}>
              {billingAddress.address.line1}
            </Text>
            {billingAddress.address.line2 && (
              <Text style={{ margin: '0' }}>
                {billingAddress.address.line2}
              </Text>
            )}
            <Text style={{ margin: '0' }}>
              {billingAddress.address.city},{' '}
              {billingAddress.address.state}{' '}
              {billingAddress.address.postal_code}
            </Text>
            <Text style={{ margin: '0' }}>
              {billingAddress.address.country}
            </Text>
          </>
        )}
        <Text style={{ margin: '5px 0 0 0' }}>
          {customerProfile.email}
        </Text>
      </Column>
    </Row>
  )
}

interface InvoiceLineItemsProps {
  lineItems: InvoiceLineItem.Record[]
}

export const InvoiceLineItems: React.FC<InvoiceLineItemsProps> = ({
  lineItems,
}) => {
  return (
    <Section style={{ marginBottom: '30px' }}>
      <table className="invoice-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Description</th>
            <th className="qty-column" style={{ textAlign: 'right' }}>
              Qty
            </th>
            <th
              className="price-column"
              style={{ textAlign: 'right' }}
            >
              Unit price
            </th>
            <th
              className="amount-column"
              style={{ textAlign: 'right' }}
            >
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item) => (
            <tr key={item.id}>
              <td>{item.description}</td>
              <td
                className="qty-column"
                style={{ textAlign: 'right' }}
              >
                {item.quantity}
              </td>
              <td
                className="price-column"
                style={{ textAlign: 'right' }}
              >
                {formatCurrency(item.price)}
              </td>
              <td
                className="amount-column"
                style={{ textAlign: 'right' }}
              >
                {formatCurrency(item.price * item.quantity)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

interface PaymentInfoProps {
  invoice: Invoice.Record
  total: number
  paymentLink?: string
  mode: 'receipt' | 'invoice'
  payment?: Payment.Record
}

const constructPaymentLink = (invoice: Invoice.Record) => {
  return `/invoice/view/${invoice.organizationId}/${invoice.id}`
}

export const PaymentInfo: React.FC<PaymentInfoProps> = ({
  invoice,
  total,
  paymentLink,
  mode,
  payment,
}) => {
  const formattedDueDate = invoice.dueDate
    ? formatDate(invoice.dueDate)
    : formatDate(invoice.createdAt)

  if (mode === 'receipt' && payment) {
    return (
      <Section style={{ marginBottom: '20px' }}>
        <Text
          style={{
            fontSize: '24px',
            fontWeight: '700',
            margin: '30px 0 10px 0',
          }}
        >
          {formatCurrency(payment.amount)} paid on{' '}
          {formatDate(payment.chargeDate)}
        </Text>
      </Section>
    )
  }

  return (
    <Section style={{ marginBottom: '20px' }}>
      <Text
        style={{
          fontSize: '24px',
          fontWeight: '700',
          margin: '30px 0 10px 0',
        }}
      >
        {formatCurrency(total)} {invoice.currency || 'USD'} due{' '}
        {formattedDueDate}
      </Text>

      {paymentLink && (
        <Text style={{ margin: '0 0 30px 0' }}>
          <Link
            href={paymentLink}
            style={{ color: '#1a73e8', textDecoration: 'none' }}
          >
            Pay online
          </Link>
        </Text>
      )}
    </Section>
  )
}

interface InvoiceTotalsProps {
  subtotal: number
  taxAmount: number
  total: number
  currency?: string
  mode: 'receipt' | 'invoice'
  payment?: Payment.Record
}

export const InvoiceTotals: React.FC<InvoiceTotalsProps> = ({
  subtotal,
  taxAmount,
  total,
  currency = 'USD',
  mode,
  payment,
}) => {
  return (
    <Row>
      <Column style={{ width: '60%' }}></Column>
      <Column style={{ width: '40%' }}>
        <table style={{ width: '100%' }}>
          <tbody>
            <tr
              style={{
                fontWeight: 'normal',
                borderTop: '1px solid #eee',
              }}
            >
              <td style={{ padding: '5px 0', textAlign: 'left' }}>
                Subtotal
              </td>
              <td style={{ padding: '5px 0', textAlign: 'right' }}>
                {formatCurrency(subtotal)}
              </td>
            </tr>
            {taxAmount > 0 && (
              <tr
                style={{
                  fontWeight: 'normal',
                  borderTop: '1px solid #eee',
                }}
              >
                <td style={{ padding: '5px 0', textAlign: 'left' }}>
                  Tax
                </td>
                <td style={{ padding: '5px 0', textAlign: 'right' }}>
                  {formatCurrency(taxAmount)}
                </td>
              </tr>
            )}
            <tr
              style={{
                fontWeight: 'bold',
                borderTop: '1px solid #eee',
              }}
            >
              <td
                style={{ padding: '10px 0 5px 0', textAlign: 'left' }}
              >
                Total
              </td>
              <td
                style={{
                  padding: '10px 0 5px 0',
                  textAlign: 'right',
                }}
              >
                {formatCurrency(total)}
              </td>
            </tr>
            {mode === 'receipt' && payment ? (
              <>
                <tr style={{ fontWeight: 'bold' }}>
                  <td style={{ padding: '5px 0', textAlign: 'left' }}>
                    Amount paid
                  </td>
                  <td
                    style={{ padding: '5px 0', textAlign: 'right' }}
                  >
                    {formatCurrency(payment.amount)} {currency}
                  </td>
                </tr>
                {payment.refunded &&
                  payment.refundedAmount &&
                  payment.refundedAt && (
                    <>
                      <tr style={{ fontWeight: 'bold' }}>
                        <td
                          style={{
                            padding: '5px 0',
                            textAlign: 'left',
                          }}
                        >
                          Refunded on {formatDate(payment.refundedAt)}
                        </td>
                        <td
                          style={{
                            padding: '5px 0',
                            textAlign: 'right',
                          }}
                        >
                          {formatCurrency(payment.refundedAmount)}
                        </td>
                      </tr>
                      <tr style={{ fontWeight: 'bold' }}>
                        <td
                          style={{
                            padding: '5px 0',
                            textAlign: 'left',
                          }}
                        >
                          Total refunded without credit note
                        </td>
                        <td
                          style={{
                            padding: '5px 0',
                            textAlign: 'right',
                          }}
                        >
                          {formatCurrency(payment.refundedAmount)}
                        </td>
                      </tr>
                    </>
                  )}
              </>
            ) : (
              <tr style={{ fontWeight: 'bold' }}>
                <td style={{ padding: '5px 0', textAlign: 'left' }}>
                  Amount due
                </td>
                <td style={{ padding: '5px 0', textAlign: 'right' }}>
                  {formatCurrency(total)} {currency}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Column>
    </Row>
  )
}

interface InvoiceFooterProps {
  organization: Organization.Record
}

export const InvoiceFooter: React.FC<InvoiceFooterProps> = ({
  organization,
}) => {
  return (
    <Section style={{ marginTop: '50px', textAlign: 'center' }}>
      {/* <Text
        style={{ fontSize: '12px', color: '#666', margin: '5px 0' }}
      >
        Thank you for your business!
      </Text> */}
      {/* {organization.tagline && (
        <Text
          style={{ fontSize: '12px', color: '#666', margin: '5px 0' }}
        >
          {organization.tagline}
        </Text>
      )} */}
    </Section>
  )
}

export interface InvoiceTemplateProps {
  invoice: Invoice.Record
  invoiceLineItems: InvoiceLineItem.Record[]
  customerProfile: CustomerProfile.Record
  organization: Organization.Record
  paymentLink?: string
  paymentDataItems?: PaymentAndPaymentMethod[]
}

export const InvoiceTemplate: React.FC<InvoiceTemplateProps> = ({
  invoice,
  invoiceLineItems,
  customerProfile,
  organization,
  paymentLink,
}) => {
  const subtotal = invoice.subtotal ?? 0
  const taxAmount = invoice.taxAmount || 0
  const total = subtotal + taxAmount
  const billingAddress = customerProfile.billingAddress

  return (
    <Html>
      <Head>
        <title>Invoice #{invoice.invoiceNumber}</title>
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
            mode="invoice"
          />
          <DocumentDetails invoice={invoice} mode="invoice" />
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
            paymentLink={paymentLink}
            mode="invoice"
          />
          <InvoiceLineItems lineItems={invoiceLineItems} />
          <InvoiceTotals
            subtotal={subtotal}
            taxAmount={taxAmount}
            total={total}
            currency={invoice.currency}
            mode="invoice"
          />
          <InvoiceFooter organization={organization} />
        </Container>
      </Body>
    </Html>
  )
}
