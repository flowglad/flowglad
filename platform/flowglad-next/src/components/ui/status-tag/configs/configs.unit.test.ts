import { describe, expect, it } from 'bun:test'
import {
  PriceType,
  PurchaseStatus,
  SubscriptionStatus,
} from '@db-core/enums'
import {
  AlertCircle,
  AlertTriangle,
  CalendarCheck,
  Check,
  Clock,
  FilePenLine,
  FileText,
  FileX,
  PauseCircle,
  RefreshCcw,
  RefreshCw,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react'
import type { Purchase } from '@/db/schema/purchases'
import { InvoiceStatus, PaymentStatus } from '@/types'
import { type ActiveStatus, activeStatusConfig } from './active'
import { invoiceStatusConfig } from './invoice'
import { paymentStatusConfig } from './payment'
import {
  getPurchaseDisplayStatus,
  purchaseDisplayStatusConfig,
  purchaseStatusConfig,
} from './purchase'
import { subscriptionStatusConfig } from './subscription'

describe('subscriptionStatusConfig', () => {
  it('maps SubscriptionStatus.Active to "success" variant with "Active" label and Check icon', () => {
    const config = subscriptionStatusConfig[SubscriptionStatus.Active]

    expect(config.label).toBe('Active')
    expect(config.variant).toBe('success')
    expect(config.icon).toBe(Check)
    expect(config.tooltip).toContain('active')
  })

  it('maps SubscriptionStatus.Canceled to "muted" variant with X icon (terminal state)', () => {
    const config =
      subscriptionStatusConfig[SubscriptionStatus.Canceled]

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Canceled')
    expect(config.icon).toBe(X)
    expect(config.tooltip).toContain('terminated')
    expect(config.tooltip).toContain('no longer has access')
  })

  it('maps SubscriptionStatus.PastDue to "destructive" variant with AlertCircle icon (action required)', () => {
    const config =
      subscriptionStatusConfig[SubscriptionStatus.PastDue]

    expect(config.variant).toBe('destructive')
    expect(config.label).toBe('Past Due')
    expect(config.icon).toBe(AlertCircle)
    expect(config.tooltip).toContain('failed')
  })

  it('maps SubscriptionStatus.Trialing to "info" variant with Clock icon and trial tooltip', () => {
    const config =
      subscriptionStatusConfig[SubscriptionStatus.Trialing]

    expect(config.variant).toBe('info')
    expect(config.label).toBe('Trialing')
    expect(config.icon).toBe(Clock)
    expect(config.tooltip).toContain('trial')
  })

  it('maps SubscriptionStatus.CancellationScheduled to "muted" variant with Clock icon', () => {
    const config =
      subscriptionStatusConfig[
        SubscriptionStatus.CancellationScheduled
      ]

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Cancellation Scheduled')
    expect(config.icon).toBe(Clock)
    expect(config.tooltip).toContain('cancellation')
    expect(config.tooltip).toContain('Full access continues')
  })

  it('maps SubscriptionStatus.Incomplete to "warning" variant with AlertTriangle icon', () => {
    const config =
      subscriptionStatusConfig[SubscriptionStatus.Incomplete]

    expect(config.variant).toBe('warning')
    expect(config.label).toBe('Incomplete')
    expect(config.icon).toBe(AlertTriangle)
  })

  it('maps SubscriptionStatus.IncompleteExpired to "muted" variant with XCircle icon', () => {
    const config =
      subscriptionStatusConfig[SubscriptionStatus.IncompleteExpired]

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Incomplete Expired')
    expect(config.icon).toBe(XCircle)
  })

  it('maps SubscriptionStatus.Paused to "amethyst" variant with PauseCircle icon', () => {
    const config = subscriptionStatusConfig[SubscriptionStatus.Paused]

    expect(config.variant).toBe('amethyst')
    expect(config.label).toBe('Paused')
    expect(config.icon).toBe(PauseCircle)
  })

  it('covers all SubscriptionStatus enum values', () => {
    const configuredStatuses = Object.keys(subscriptionStatusConfig)
    const allStatuses = Object.values(SubscriptionStatus)

    expect(configuredStatuses).toHaveLength(allStatuses.length)
    for (const status of allStatuses) {
      const config = subscriptionStatusConfig[status]
      expect(typeof config.label).toBe('string')
      expect(typeof config.variant).toBe('string')
    }
  })
})

describe('invoiceStatusConfig', () => {
  it('maps InvoiceStatus.Paid to "success" variant with Check icon', () => {
    const config = invoiceStatusConfig[InvoiceStatus.Paid]

    expect(config.variant).toBe('success')
    expect(config.label).toBe('Paid')
    expect(config.icon).toBe(Check)
  })

  it('maps InvoiceStatus.AwaitingPaymentConfirmation to "info" variant with Clock icon', () => {
    const config =
      invoiceStatusConfig[InvoiceStatus.AwaitingPaymentConfirmation]

    expect(config.variant).toBe('info')
    expect(config.label).toBe('Confirming')
    expect(config.icon).toBe(Clock)
  })

  it('maps InvoiceStatus.Void to "muted" variant with FileX icon (terminal state)', () => {
    const config = invoiceStatusConfig[InvoiceStatus.Void]

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Void')
    expect(config.icon).toBe(FileX)
  })

  it('maps InvoiceStatus.Draft to "muted" variant with FilePenLine icon', () => {
    const config = invoiceStatusConfig[InvoiceStatus.Draft]

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Draft')
    expect(config.icon).toBe(FilePenLine)
  })

  it('maps InvoiceStatus.Open to "info" variant with FileText icon', () => {
    const config = invoiceStatusConfig[InvoiceStatus.Open]

    expect(config.variant).toBe('info')
    expect(config.label).toBe('Open')
    expect(config.icon).toBe(FileText)
  })

  it('maps InvoiceStatus.Uncollectible to "destructive" variant with XCircle icon', () => {
    const config = invoiceStatusConfig[InvoiceStatus.Uncollectible]

    expect(config.variant).toBe('destructive')
    expect(config.label).toBe('Uncollectible')
    expect(config.icon).toBe(XCircle)
  })

  it('maps InvoiceStatus.FullyRefunded to "muted" variant with RefreshCcw icon', () => {
    const config = invoiceStatusConfig[InvoiceStatus.FullyRefunded]

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Refunded')
    expect(config.icon).toBe(RefreshCcw)
  })

  it('maps InvoiceStatus.PartiallyRefunded to "warning" variant with RefreshCw icon', () => {
    const config =
      invoiceStatusConfig[InvoiceStatus.PartiallyRefunded]

    expect(config.variant).toBe('warning')
    expect(config.label).toBe('Partial Refund')
    expect(config.icon).toBe(RefreshCw)
  })

  it('covers all InvoiceStatus enum values', () => {
    const configuredStatuses = Object.keys(invoiceStatusConfig)
    const allStatuses = Object.values(InvoiceStatus)

    expect(configuredStatuses).toHaveLength(allStatuses.length)
    for (const status of allStatuses) {
      const config = invoiceStatusConfig[status]
      expect(typeof config.label).toBe('string')
      expect(typeof config.variant).toBe('string')
    }
  })
})

describe('paymentStatusConfig', () => {
  it('maps PaymentStatus.Succeeded to "success" variant with Check icon', () => {
    const config = paymentStatusConfig[PaymentStatus.Succeeded]

    expect(config.variant).toBe('success')
    expect(config.label).toBe('Succeeded')
    expect(config.icon).toBe(Check)
  })

  it('maps PaymentStatus.RequiresAction to "warning" variant with AlertTriangle icon', () => {
    const config = paymentStatusConfig[PaymentStatus.RequiresAction]

    expect(config.variant).toBe('warning')
    expect(config.label).toBe('Action Required')
    expect(config.icon).toBe(AlertTriangle)
  })

  it('maps PaymentStatus.Failed to "destructive" variant with XCircle icon', () => {
    const config = paymentStatusConfig[PaymentStatus.Failed]

    expect(config.variant).toBe('destructive')
    expect(config.label).toBe('Failed')
    expect(config.icon).toBe(XCircle)
  })

  it('maps PaymentStatus.Processing to "info" variant with Clock icon', () => {
    const config = paymentStatusConfig[PaymentStatus.Processing]

    expect(config.variant).toBe('info')
    expect(config.label).toBe('Processing')
    expect(config.icon).toBe(Clock)
  })

  it('maps PaymentStatus.Canceled to "muted" variant with X icon', () => {
    const config = paymentStatusConfig[PaymentStatus.Canceled]

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Canceled')
    expect(config.icon).toBe(X)
  })

  it('maps PaymentStatus.Refunded to "muted" variant with RefreshCcw icon', () => {
    const config = paymentStatusConfig[PaymentStatus.Refunded]

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Refunded')
    expect(config.icon).toBe(RefreshCcw)
  })

  it('maps PaymentStatus.RequiresConfirmation to "warning" variant with AlertCircle icon', () => {
    const config =
      paymentStatusConfig[PaymentStatus.RequiresConfirmation]

    expect(config.variant).toBe('warning')
    expect(config.label).toBe('Needs Confirmation')
    expect(config.icon).toBe(AlertCircle)
  })

  it('covers all PaymentStatus enum values', () => {
    const configuredStatuses = Object.keys(paymentStatusConfig)
    const allStatuses = Object.values(PaymentStatus)

    expect(configuredStatuses).toHaveLength(allStatuses.length)
    for (const status of allStatuses) {
      const config = paymentStatusConfig[status]
      expect(typeof config.label).toBe('string')
      expect(typeof config.variant).toBe('string')
    }
  })
})

describe('purchaseStatusConfig', () => {
  it('maps PurchaseStatus.Paid to "success" variant with Check icon', () => {
    const config = purchaseStatusConfig[PurchaseStatus.Paid]

    expect(config.variant).toBe('success')
    expect(config.label).toBe('Paid')
    expect(config.icon).toBe(Check)
  })

  it('maps PurchaseStatus.Fraudulent to "destructive" variant with ShieldAlert icon', () => {
    const config = purchaseStatusConfig[PurchaseStatus.Fraudulent]

    expect(config.variant).toBe('destructive')
    expect(config.label).toBe('Fraudulent')
    expect(config.icon).toBe(ShieldAlert)
  })

  it('maps PurchaseStatus.Open to "info" variant with FileText icon', () => {
    const config = purchaseStatusConfig[PurchaseStatus.Open]

    expect(config.variant).toBe('info')
    expect(config.label).toBe('Open')
    expect(config.icon).toBe(FileText)
  })

  it('maps PurchaseStatus.Pending to "info" variant with Clock icon (waiting on payment provider)', () => {
    const config = purchaseStatusConfig[PurchaseStatus.Pending]

    expect(config.variant).toBe('info')
    expect(config.label).toBe('Pending')
    expect(config.icon).toBe(Clock)
  })

  it('maps PurchaseStatus.Failed to "destructive" variant with XCircle icon', () => {
    const config = purchaseStatusConfig[PurchaseStatus.Failed]

    expect(config.variant).toBe('destructive')
    expect(config.label).toBe('Failed')
    expect(config.icon).toBe(XCircle)
  })

  it('maps PurchaseStatus.Refunded to "muted" variant with RefreshCcw icon', () => {
    const config = purchaseStatusConfig[PurchaseStatus.Refunded]

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Refunded')
    expect(config.icon).toBe(RefreshCcw)
  })

  it('maps PurchaseStatus.PartialRefund to "warning" variant with RefreshCw icon', () => {
    const config = purchaseStatusConfig[PurchaseStatus.PartialRefund]

    expect(config.variant).toBe('warning')
    expect(config.label).toBe('Partial Refund')
    expect(config.icon).toBe(RefreshCw)
  })

  it('covers all PurchaseStatus enum values', () => {
    const configuredStatuses = Object.keys(purchaseStatusConfig)
    const allStatuses = Object.values(PurchaseStatus)

    expect(configuredStatuses).toHaveLength(allStatuses.length)
    for (const status of allStatuses) {
      const config = purchaseStatusConfig[status]
      expect(typeof config.label).toBe('string')
      expect(typeof config.variant).toBe('string')
    }
  })
})

describe('purchaseDisplayStatusConfig', () => {
  it('includes all PurchaseStatus enum values plus "concluded"', () => {
    const configuredStatuses = Object.keys(
      purchaseDisplayStatusConfig
    )
    const allDatabaseStatuses = Object.values(PurchaseStatus)

    // Should have all database statuses plus "concluded"
    expect(configuredStatuses).toHaveLength(
      allDatabaseStatuses.length + 1
    )

    // All database statuses should be present with required properties
    for (const status of allDatabaseStatuses) {
      const config = purchaseDisplayStatusConfig[status]
      expect(typeof config.label).toBe('string')
      expect(typeof config.variant).toBe('string')
    }

    // "concluded" should be present with required properties
    const concludedConfig = purchaseDisplayStatusConfig.concluded
    expect(typeof concludedConfig.label).toBe('string')
    expect(typeof concludedConfig.variant).toBe('string')
  })

  it('maps "concluded" to "muted" variant with CalendarCheck icon and appropriate tooltip', () => {
    const config = purchaseDisplayStatusConfig.concluded

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Concluded')
    expect(config.icon).toBe(CalendarCheck)
    expect(config.tooltip).toContain('ended')
  })
})

describe('getPurchaseDisplayStatus', () => {
  /**
   * Creates a type-safe mock Purchase.SinglePaymentPurchaseClientRecord
   * with sensible defaults for all required fields.
   * Only status, endDate, and purchaseDate are configurable since
   * getPurchaseDisplayStatus only uses these fields.
   */
  const createMockPurchase = (overrides: {
    status: PurchaseStatus
    endDate: number | null
    purchaseDate?: number | null
  }): Purchase.SinglePaymentPurchaseClientRecord => ({
    // Base table fields
    id: 'prch_test_123',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    livemode: false,

    // Purchase-specific fields
    name: 'Test Purchase',
    customerId: 'cust_test_123',
    organizationId: 'org_test_123',
    priceId: 'price_test_123',
    pricingModelId: 'pm_test_123',
    quantity: 1,
    bankPaymentOnly: false,
    proposal: null,
    archived: false,
    billingAddress: null,
    billingCycleAnchor: null,
    metadata: null,

    // Single payment discriminator
    priceType: PriceType.SinglePayment,
    firstInvoiceValue: 0,
    totalPurchaseValue: 100,

    // Subscription fields (null for single payment)
    trialPeriodDays: null,
    pricePerBillingCycle: null,
    intervalUnit: null,
    intervalCount: null,

    // Overridable fields for testing
    status: overrides.status,
    endDate: overrides.endDate,
    purchaseDate: overrides.purchaseDate ?? null,
  })

  it('returns "concluded" when purchase has an endDate, regardless of database status or purchaseDate', () => {
    const purchase = createMockPurchase({
      status: PurchaseStatus.Paid,
      endDate: Date.now(),
      purchaseDate: Date.now(),
    })

    const displayStatus = getPurchaseDisplayStatus(purchase)

    expect(displayStatus).toBe('concluded')
  })

  it('returns "paid" when purchase has a purchaseDate but no endDate, regardless of database status', () => {
    const purchase = createMockPurchase({
      status: PurchaseStatus.Pending,
      endDate: null,
      purchaseDate: Date.now(),
    })

    const displayStatus = getPurchaseDisplayStatus(purchase)

    expect(displayStatus).toBe(PurchaseStatus.Paid)
  })

  it('returns "paid" when purchaseDate exists even if database status is Open', () => {
    const purchase = createMockPurchase({
      status: PurchaseStatus.Open,
      endDate: null,
      purchaseDate: Date.now(),
    })

    const displayStatus = getPurchaseDisplayStatus(purchase)

    expect(displayStatus).toBe(PurchaseStatus.Paid)
  })

  it('returns the database status when purchase has no endDate and no purchaseDate (status is Pending)', () => {
    const purchase = createMockPurchase({
      status: PurchaseStatus.Pending,
      endDate: null,
      purchaseDate: null,
    })

    const displayStatus = getPurchaseDisplayStatus(purchase)

    expect(displayStatus).toBe(PurchaseStatus.Pending)
  })

  it('returns the database status when purchase has no endDate and no purchaseDate (status is Open)', () => {
    const purchase = createMockPurchase({
      status: PurchaseStatus.Open,
      endDate: null,
      purchaseDate: null,
    })

    const displayStatus = getPurchaseDisplayStatus(purchase)

    expect(displayStatus).toBe(PurchaseStatus.Open)
  })

  it('returns the database status when purchase has no endDate and no purchaseDate (status is Failed)', () => {
    const purchase = createMockPurchase({
      status: PurchaseStatus.Failed,
      endDate: null,
      purchaseDate: null,
    })

    const displayStatus = getPurchaseDisplayStatus(purchase)

    expect(displayStatus).toBe(PurchaseStatus.Failed)
  })

  it('returns "concluded" even when database status is Refunded if endDate exists', () => {
    const purchase = createMockPurchase({
      status: PurchaseStatus.Refunded,
      endDate: Date.now(),
      purchaseDate: Date.now(),
    })

    const displayStatus = getPurchaseDisplayStatus(purchase)

    expect(displayStatus).toBe('concluded')
  })

  it('returns "concluded" when endDate is 0 (epoch timestamp is a valid date value)', () => {
    const purchase = createMockPurchase({
      status: PurchaseStatus.Paid,
      endDate: 0,
      purchaseDate: Date.now(),
    })

    const displayStatus = getPurchaseDisplayStatus(purchase)

    expect(displayStatus).toBe('concluded')
  })

  it('returns "paid" when purchaseDate is 0 and endDate is null (epoch timestamp is a valid date value)', () => {
    const purchase = createMockPurchase({
      status: PurchaseStatus.Pending,
      endDate: null,
      purchaseDate: 0,
    })

    const displayStatus = getPurchaseDisplayStatus(purchase)

    expect(displayStatus).toBe(PurchaseStatus.Paid)
  })
})

describe('activeStatusConfig', () => {
  it('maps "active" to "success" variant with Check icon', () => {
    const config = activeStatusConfig.active

    expect(config.variant).toBe('success')
    expect(config.label).toBe('Active')
    expect(config.icon).toBe(Check)
  })

  it('maps "inactive" to "muted" variant with X icon', () => {
    const config = activeStatusConfig.inactive

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Inactive')
    expect(config.icon).toBe(X)
  })

  it('covers all ActiveStatus values', () => {
    const configuredStatuses = Object.keys(activeStatusConfig)
    const allStatuses: ActiveStatus[] = ['active', 'inactive']

    expect(configuredStatuses).toHaveLength(allStatuses.length)
    for (const status of allStatuses) {
      const config = activeStatusConfig[status]
      expect(typeof config.label).toBe('string')
      expect(typeof config.variant).toBe('string')
    }
  })
})
