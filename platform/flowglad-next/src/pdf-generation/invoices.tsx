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
import { Customer } from '@/db/schema/customers'
import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import { formatDate, titleCase } from '@/utils/core'
import { BillingAddress } from '@/db/schema/organizations'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { paymentMethodSummaryLabel } from '@/utils/paymentMethodHelpers'
import { PaymentAndPaymentMethod } from '@/db/tableMethods/paymentMethods'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { calculateInvoiceTotalsRaw, calculateDiscountAmountSafe } from '@/utils/discountHelpers'
import { CurrencyCode } from '@/types'

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
          data-testid="document-title"
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
            data-testid="organization-logo"
            src={organization.logoURL}
            alt={`${organization.name}`}
            width="64"
            height="64"
            style={{ marginLeft: 'auto' }}
          />
        ) : (
          <Text
            data-testid="organization-name"
            style={{ fontSize: '24px', fontWeight: 'bold' }}
          >
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
          <span data-testid="document-number">
            {mode === 'receipt' && paymentData
              ? paymentData.payment.id
              : invoice.invoiceNumber}
          </span>
        </Text>
        <Text style={{ margin: '5px 0', fontWeight: 'normal' }}>
          <span style={{ display: 'inline-block', width: '150px' }}>
            {mode === 'receipt' ? 'Date paid' : 'Date of issue'}
          </span>
          <span data-testid="document-date">
            {mode === 'receipt' && paymentData
              ? formatDate(paymentData.payment.chargeDate)
              : formattedInvoiceDate}
          </span>
        </Text>
        {mode === 'receipt' && paymentData && (
          <Text style={{ margin: '5px 0', fontWeight: 'normal' }}>
            <span style={{ display: 'inline-block', width: '150px' }}>
              Payment method
            </span>
            <span data-testid="payment-method">
              {safePaymentMethodSummaryLabel(paymentData)}
            </span>
          </Text>
        )}
        {mode === 'invoice' && (
          <Text style={{ margin: '5px 0', fontWeight: 'normal' }}>
            <span style={{ display: 'inline-block', width: '150px' }}>
              Date due
            </span>
            <span data-testid="due-date">{formattedDueDate}</span>
          </Text>
        )}
      </Column>
    </Row>
  )
}

interface CheckoutInfoProps {
  organization: Organization.Record
  customer: Customer.Record
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
      <Text
        style={{ fontWeight: 'bold', margin: '0 0 5px 0' }}
        data-testid="organization-contact-info-name"
      >
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

export const BillingInfo: React.FC<CheckoutInfoProps> = ({
  organization,
  customer,
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
        <Text
          data-testid="bill-to-label"
          style={{ fontWeight: 'bold', margin: '0 0 5px 0' }}
        >
          Bill to
        </Text>
        <Text data-testid="customer-name" style={{ margin: '0' }}>
          {customer.name}
        </Text>
        {billingAddress && (
          <>
            <Text data-testid="address-line1" style={{ margin: '0' }}>
              {billingAddress.address.line1}
            </Text>
            {billingAddress.address.line2 && (
              <Text
                data-testid="address-line2"
                style={{ margin: '0' }}
              >
                {billingAddress.address.line2}
              </Text>
            )}
            <Text
              data-testid="address-city-state"
              style={{ margin: '0' }}
            >
              {billingAddress.address.city},{' '}
              {billingAddress.address.state}{' '}
              {billingAddress.address.postal_code}
            </Text>
            <Text
              data-testid="address-country"
              style={{ margin: '0' }}
            >
              {billingAddress.address.country}
            </Text>
          </>
        )}
        <Text
          data-testid="customer-email"
          style={{ margin: '5px 0 0 0' }}
        >
          {customer.email}
        </Text>
      </Column>
    </Row>
  )
}

interface InvoiceLineItemsProps {
  lineItems: InvoiceLineItem.Record[]
  currency: CurrencyCode
}

export const InvoiceLineItems: React.FC<InvoiceLineItemsProps> = ({
  lineItems,
  currency,
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
              <td data-testid="line-item-description">
                {item.description}
              </td>
              <td
                data-testid="line-item-quantity"
                className="qty-column"
                style={{ textAlign: 'right' }}
              >
                {item.quantity}
              </td>
              <td
                data-testid="line-item-price"
                className="price-column"
                style={{ textAlign: 'right' }}
              >
                {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                  currency,
                  item.price
                )}
              </td>
              <td
                data-testid="line-item-amount-column"
                className="amount-column"
                style={{ textAlign: 'right' }}
              >
                {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                  currency,
                  item.price * item.quantity
                )}
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
          data-testid="payment-amount-date"
          style={{
            fontSize: '24px',
            fontWeight: '700',
            margin: '30px 0 10px 0',
          }}
        >
          {stripeCurrencyAmountToHumanReadableCurrencyAmount(
            payment.currency,
            payment.amount
          )}{' '}
          paid on {formatDate(payment.chargeDate)}
        </Text>
      </Section>
    )
  }

  return (
    <Section style={{ marginBottom: '20px' }}>
      <Text
        data-testid="amount-due-with-due-date"
        style={{
          fontSize: '24px',
          fontWeight: '700',
          margin: '30px 0 10px 0',
        }}
      >
        {stripeCurrencyAmountToHumanReadableCurrencyAmount(
          invoice.currency,
          total
        )}{' '}
        due {formattedDueDate}
      </Text>

      {paymentLink && (
        <Text style={{ margin: '0 0 30px 0' }}>
          <Link
            data-testid="pay-online-link"
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
  currency?: CurrencyCode
  mode: 'receipt' | 'invoice'
  payment?: Payment.Record
  discountInfo?: {
    discountName: string
    discountCode: string
    discountAmount: number
    discountAmountType: string
    currency: CurrencyCode
  } | null
  originalAmount?: number
}

export const InvoiceTotals: React.FC<InvoiceTotalsProps> = ({
  subtotal,
  taxAmount,
  total,
  currency = 'USD',
  mode,
  payment,
  discountInfo,
  originalAmount,
}) => {
  // Calculate discount amount using shared logic
  const calculatedDiscountAmount = calculateDiscountAmountSafe(originalAmount || subtotal, discountInfo)
  return (
    <Row data-testid="invoice-totals">
      <Column style={{ width: '60%' }}></Column>
      <Column style={{ width: '40%' }}>
        <table style={{ width: '100%' }}>
          <tbody>
            {/* Show original amount if there's a discount */}
            {originalAmount && (
              <tr
                style={{
                  fontWeight: 'normal',
                  borderTop: '1px solid #eee',
                }}
              >
                <td style={{ padding: '5px 0', textAlign: 'left' }}>
                  Amount
                </td>
                <td
                  data-testid="original-amount"
                  style={{ padding: '5px 0', textAlign: 'right' }}
                >
                  {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                    currency as CurrencyCode,
                    originalAmount
                  )}
                </td>
              </tr>
            )}
            {/* Show discount above subtotal */}
            {discountInfo && (
              <tr
                style={{
                  fontWeight: 'normal',
                  borderTop: '1px solid #eee',
                }}
              >
                <td style={{ padding: '5px 0', textAlign: 'left' }}>
                  Discount ({discountInfo.discountCode})
                </td>
                <td
                  data-testid="discount-amount"
                  style={{
                    padding: '5px 0',
                    textAlign: 'right',
                    color: '#22c55e',
                  }}
                >
                  -
                  {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                    currency as CurrencyCode,
                    calculatedDiscountAmount
                  )}
                </td>
              </tr>
            )}
            <tr
              style={{
                fontWeight: 'normal',
                borderTop: '1px solid #eee',
              }}
            >
              <td style={{ padding: '5px 0', textAlign: 'left' }}>
                Subtotal
              </td>
              <td
                data-testid="subtotal-amount"
                style={{ padding: '5px 0', textAlign: 'right' }}
              >
                {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                  currency as CurrencyCode,
                  subtotal
                )}
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
                <td
                  data-testid="tax-amount"
                  style={{ padding: '5px 0', textAlign: 'right' }}
                >
                  {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                    currency as CurrencyCode,
                    taxAmount
                  )}
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
                data-testid="total-amount"
                style={{
                  padding: '10px 0 5px 0',
                  textAlign: 'right',
                }}
              >
                {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                  currency as CurrencyCode,
                  total
                )}
              </td>
            </tr>
            {mode === 'receipt' && payment ? (
              <>
                <tr style={{ fontWeight: 'bold' }}>
                  <td style={{ padding: '5px 0', textAlign: 'left' }}>
                    Amount paid
                  </td>
                  <td
                    data-testid="amount-paid"
                    style={{ padding: '5px 0', textAlign: 'right' }}
                  >
                    {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                      payment.currency,
                      payment.amount
                    )}
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
                          data-testid="refunded-amount"
                          style={{
                            padding: '5px 0',
                            textAlign: 'right',
                          }}
                        >
                          {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                            payment.currency,
                            payment.refundedAmount
                          )}
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
                          data-testid="total-refunded"
                          style={{
                            padding: '5px 0',
                            textAlign: 'right',
                          }}
                        >
                          {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                            payment.currency,
                            payment.refundedAmount
                          )}
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
                <td
                  data-testid="amount-due"
                  style={{ padding: '5px 0', textAlign: 'right' }}
                >
                  {stripeCurrencyAmountToHumanReadableCurrencyAmount(
                    currency as CurrencyCode,
                    total
                  )}
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
  customer: Customer.Record
  organization: Organization.Record
  paymentLink?: string
  paymentDataItems?: PaymentAndPaymentMethod[]
  discountInfo?: {
    discountName: string
    discountCode: string
    discountAmount: number
    discountAmountType: string
  } | null
}

export const InvoiceTemplate: React.FC<InvoiceTemplateProps> = ({
  invoice,
  invoiceLineItems,
  customer,
  organization,
  paymentLink,
  discountInfo,
}) => {
  const totals = calculateInvoiceTotalsRaw(invoiceLineItems, invoice, discountInfo)
  const billingAddress = customer.billingAddress

  return (
    <Html data-testid="invoice-template">
      <Head>
        <title data-testid="invoice-template-title">
          Invoice #{invoice.invoiceNumber}
        </title>
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
              customer={customer}
              billingAddress={billingAddress}
            />
          )}
          <PaymentInfo
            invoice={invoice}
            total={totals.total}
            paymentLink={paymentLink}
            mode="invoice"
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
            mode="invoice"
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
