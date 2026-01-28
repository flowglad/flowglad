/**
 * Shared mock factories for PDF generation tests.
 * Used by both receipts.test.tsx and invoices.test.tsx.
 *
 * These factories create minimal mock data for React component rendering tests.
 * They use type assertions since component tests only need the fields
 * that the components actually use, not full database records.
 */

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
  SubscriptionItemType,
} from '@/types'

let idCounter = 1

/**
 * Resets the ID counter. Call this in beforeEach to ensure consistent IDs across tests.
 */
export function resetMockIdCounter(): void {
  idCounter = 1
}

export function createMockOrganization(
  overrides: Partial<Organization.Record> = {}
): Organization.Record {
  const id = `org_${idCounter++}`
  const now = Date.now()
  return {
    id,
    name: 'Test Organization',
    createdAt: now,
    updatedAt: now,
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
  } as Organization.Record
}

export function createMockCustomer(
  overrides: Partial<Customer.Record> = {}
): Customer.Record {
  const id = `cust_${idCounter++}`
  const now = Date.now()
  return {
    id,
    name: 'Test Customer',
    email: 'customer@test.com',
    organizationId: `org_${idCounter}`,
    livemode: false,
    createdAt: now,
    updatedAt: now,
    externalId: `ext_${idCounter}`,
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
  } as Customer.Record
}

export function createMockInvoice(
  overrides: Partial<Invoice.Record> = {}
): Invoice.Record {
  const id = `inv_${idCounter++}`
  const now = Date.now()
  // Use double assertion for test mocks - components only use a subset of fields
  return {
    id,
    customerId: `cust_${idCounter}`,
    organizationId: `org_${idCounter}`,
    livemode: false,
    createdAt: now,
    updatedAt: now,
    invoiceNumber: `INV-${idCounter}`,
    invoiceDate: now,
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
  } as unknown as Invoice.Record
}

export function createMockInvoiceLineItem(
  overrides: Partial<InvoiceLineItem.Record> = {}
): InvoiceLineItem.Record {
  const id = `ili_${idCounter++}`
  const now = Date.now()
  return {
    id,
    invoiceId: `inv_${idCounter}`,
    livemode: false,
    createdAt: now,
    updatedAt: now,
    description: 'Test Description',
    quantity: 1,
    price: 2500,
    priceId: `price_${idCounter}`,
    type: SubscriptionItemType.Static,
    pricingModelId: `pm_${idCounter}`,
    billingRunId: null,
    ledgerAccountId: null,
    ledgerAccountCredit: null,
    ...overrides,
  } as InvoiceLineItem.Record
}

export function createMockPayment(
  overrides: Partial<Payment.Record> = {}
): Payment.Record {
  const id = `pay_${idCounter++}`
  const now = Date.now()
  return {
    id,
    invoiceId: `inv_${idCounter}`,
    customerId: `cust_${idCounter}`,
    organizationId: `org_${idCounter}`,
    livemode: false,
    createdAt: now,
    updatedAt: now,
    amount: 6000,
    status: PaymentStatus.Succeeded,
    currency: CurrencyCode.USD,
    stripePaymentIntentId: `pi_${idCounter++}`,
    stripeChargeId: `ch_${idCounter++}`,
    chargeDate: now,
    refunded: false,
    refundedAmount: null,
    refundedAt: null,
    billingRunId: null,
    checkoutSessionId: null,
    paymentMethodId: null,
    type: 'charge',
    ...overrides,
  } as Payment.Record
}
