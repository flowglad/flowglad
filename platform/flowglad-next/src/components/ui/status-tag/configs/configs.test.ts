import { describe, expect, it } from 'vitest'
import {
  InvoiceStatus,
  PaymentStatus,
  PurchaseStatus,
  SubscriptionStatus,
} from '@/types'
import { type ActiveStatus, activeStatusConfig } from './active'
import { invoiceStatusConfig } from './invoice'
import { paymentStatusConfig } from './payment'
import { purchaseStatusConfig } from './purchase'
import { subscriptionStatusConfig } from './subscription'

describe('subscriptionStatusConfig', () => {
  it('maps SubscriptionStatus.Active to "success" variant with "Active" label and Check icon', () => {
    const config = subscriptionStatusConfig[SubscriptionStatus.Active]

    expect(config.label).toBe('Active')
    expect(config.variant).toBe('success')
    expect(typeof config.icon).toBe('function')
    expect(config.tooltip).toContain('active')
  })

  it('maps SubscriptionStatus.Canceled to "muted" variant with X icon (terminal state)', () => {
    const config =
      subscriptionStatusConfig[SubscriptionStatus.Canceled]

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Canceled')
    expect(typeof config.icon).toBe('function')
    expect(config.tooltip).toContain('terminated')
    expect(config.tooltip).toContain('no longer has access')
  })

  it('maps SubscriptionStatus.PastDue to "destructive" variant with AlertCircle icon (action required)', () => {
    const config =
      subscriptionStatusConfig[SubscriptionStatus.PastDue]

    expect(config.variant).toBe('destructive')
    expect(config.label).toBe('Past Due')
    expect(typeof config.icon).toBe('function')
    expect(config.tooltip).toContain('failed')
  })

  it('maps SubscriptionStatus.Trialing to "info" variant with Clock icon and trial tooltip', () => {
    const config =
      subscriptionStatusConfig[SubscriptionStatus.Trialing]

    expect(config.variant).toBe('info')
    expect(config.label).toBe('Trialing')
    expect(typeof config.icon).toBe('function')
    expect(config.tooltip).toContain('trial')
  })

  it('maps SubscriptionStatus.CancellationScheduled to "muted" variant with Clock icon', () => {
    const config =
      subscriptionStatusConfig[
        SubscriptionStatus.CancellationScheduled
      ]

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Cancellation Scheduled')
    expect(config.tooltip).toContain('cancellation')
    expect(config.tooltip).toContain('Full access continues')
  })

  it('maps SubscriptionStatus.Incomplete to "warning" variant with AlertTriangle icon', () => {
    const config =
      subscriptionStatusConfig[SubscriptionStatus.Incomplete]

    expect(config.variant).toBe('warning')
    expect(config.label).toBe('Incomplete')
    expect(typeof config.icon).toBe('function')
  })

  it('maps SubscriptionStatus.IncompleteExpired to "muted" variant with XCircle icon', () => {
    const config =
      subscriptionStatusConfig[SubscriptionStatus.IncompleteExpired]

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Incomplete Expired')
    expect(typeof config.icon).toBe('function')
  })

  it('maps SubscriptionStatus.Paused to "amethyst" variant with PauseCircle icon', () => {
    const config = subscriptionStatusConfig[SubscriptionStatus.Paused]

    expect(config.variant).toBe('amethyst')
    expect(config.label).toBe('Paused')
    expect(typeof config.icon).toBe('function')
  })

  it('covers all SubscriptionStatus enum values', () => {
    const configuredStatuses = Object.keys(subscriptionStatusConfig)
    const allStatuses = Object.values(SubscriptionStatus)

    expect(configuredStatuses).toHaveLength(allStatuses.length)
    for (const status of allStatuses) {
      expect(subscriptionStatusConfig[status]).toMatchObject({
        label: expect.any(String),
        variant: expect.any(String),
      })
    }
  })
})

describe('invoiceStatusConfig', () => {
  it('maps InvoiceStatus.Paid to "success" variant with Check icon', () => {
    const config = invoiceStatusConfig[InvoiceStatus.Paid]

    expect(config.variant).toBe('success')
    expect(config.label).toBe('Paid')
    expect(typeof config.icon).toBe('function')
  })

  it('maps InvoiceStatus.AwaitingPaymentConfirmation to "info" variant with Clock icon', () => {
    const config =
      invoiceStatusConfig[InvoiceStatus.AwaitingPaymentConfirmation]

    expect(config.variant).toBe('info')
    expect(config.label).toBe('Confirming')
    expect(typeof config.icon).toBe('function')
  })

  it('maps InvoiceStatus.Void to "muted" variant with FileX icon (terminal state)', () => {
    const config = invoiceStatusConfig[InvoiceStatus.Void]

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Void')
    expect(typeof config.icon).toBe('function')
  })

  it('maps InvoiceStatus.Draft to "muted" variant with FilePenLine icon', () => {
    const config = invoiceStatusConfig[InvoiceStatus.Draft]

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Draft')
    expect(typeof config.icon).toBe('function')
  })

  it('maps InvoiceStatus.Open to "info" variant with FileText icon', () => {
    const config = invoiceStatusConfig[InvoiceStatus.Open]

    expect(config.variant).toBe('info')
    expect(config.label).toBe('Open')
    expect(typeof config.icon).toBe('function')
  })

  it('maps InvoiceStatus.Uncollectible to "destructive" variant with XCircle icon', () => {
    const config = invoiceStatusConfig[InvoiceStatus.Uncollectible]

    expect(config.variant).toBe('destructive')
    expect(config.label).toBe('Uncollectible')
    expect(typeof config.icon).toBe('function')
  })

  it('maps InvoiceStatus.FullyRefunded to "muted" variant with RefreshCcw icon', () => {
    const config = invoiceStatusConfig[InvoiceStatus.FullyRefunded]

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Refunded')
    expect(typeof config.icon).toBe('function')
  })

  it('maps InvoiceStatus.PartiallyRefunded to "warning" variant with RefreshCw icon', () => {
    const config =
      invoiceStatusConfig[InvoiceStatus.PartiallyRefunded]

    expect(config.variant).toBe('warning')
    expect(config.label).toBe('Partial Refund')
    expect(typeof config.icon).toBe('function')
  })

  it('covers all InvoiceStatus enum values', () => {
    const configuredStatuses = Object.keys(invoiceStatusConfig)
    const allStatuses = Object.values(InvoiceStatus)

    expect(configuredStatuses).toHaveLength(allStatuses.length)
    for (const status of allStatuses) {
      expect(invoiceStatusConfig[status]).toMatchObject({
        label: expect.any(String),
        variant: expect.any(String),
      })
    }
  })
})

describe('paymentStatusConfig', () => {
  it('maps PaymentStatus.Succeeded to "success" variant with Check icon', () => {
    const config = paymentStatusConfig[PaymentStatus.Succeeded]

    expect(config.variant).toBe('success')
    expect(config.label).toBe('Succeeded')
    expect(typeof config.icon).toBe('function')
  })

  it('maps PaymentStatus.RequiresAction to "warning" variant with AlertTriangle icon', () => {
    const config = paymentStatusConfig[PaymentStatus.RequiresAction]

    expect(config.variant).toBe('warning')
    expect(config.label).toBe('Action Required')
    expect(typeof config.icon).toBe('function')
  })

  it('maps PaymentStatus.Failed to "destructive" variant with XCircle icon', () => {
    const config = paymentStatusConfig[PaymentStatus.Failed]

    expect(config.variant).toBe('destructive')
    expect(config.label).toBe('Failed')
    expect(typeof config.icon).toBe('function')
  })

  it('maps PaymentStatus.Processing to "info" variant with Clock icon', () => {
    const config = paymentStatusConfig[PaymentStatus.Processing]

    expect(config.variant).toBe('info')
    expect(config.label).toBe('Processing')
    expect(typeof config.icon).toBe('function')
  })

  it('maps PaymentStatus.Canceled to "muted" variant with X icon', () => {
    const config = paymentStatusConfig[PaymentStatus.Canceled]

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Canceled')
    expect(typeof config.icon).toBe('function')
  })

  it('maps PaymentStatus.Refunded to "muted" variant with RefreshCcw icon', () => {
    const config = paymentStatusConfig[PaymentStatus.Refunded]

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Refunded')
    expect(typeof config.icon).toBe('function')
  })

  it('maps PaymentStatus.RequiresConfirmation to "warning" variant with AlertCircle icon', () => {
    const config =
      paymentStatusConfig[PaymentStatus.RequiresConfirmation]

    expect(config.variant).toBe('warning')
    expect(config.label).toBe('Needs Confirmation')
    expect(typeof config.icon).toBe('function')
  })

  it('covers all PaymentStatus enum values', () => {
    const configuredStatuses = Object.keys(paymentStatusConfig)
    const allStatuses = Object.values(PaymentStatus)

    expect(configuredStatuses).toHaveLength(allStatuses.length)
    for (const status of allStatuses) {
      expect(paymentStatusConfig[status]).toMatchObject({
        label: expect.any(String),
        variant: expect.any(String),
      })
    }
  })
})

describe('purchaseStatusConfig', () => {
  it('maps PurchaseStatus.Paid to "success" variant with Check icon', () => {
    const config = purchaseStatusConfig[PurchaseStatus.Paid]

    expect(config.variant).toBe('success')
    expect(config.label).toBe('Paid')
    expect(typeof config.icon).toBe('function')
  })

  it('maps PurchaseStatus.Fraudulent to "destructive" variant with ShieldAlert icon', () => {
    const config = purchaseStatusConfig[PurchaseStatus.Fraudulent]

    expect(config.variant).toBe('destructive')
    expect(config.label).toBe('Fraudulent')
    expect(typeof config.icon).toBe('function')
  })

  it('maps PurchaseStatus.Open to "info" variant with FileText icon', () => {
    const config = purchaseStatusConfig[PurchaseStatus.Open]

    expect(config.variant).toBe('info')
    expect(config.label).toBe('Open')
    expect(typeof config.icon).toBe('function')
  })

  it('maps PurchaseStatus.Pending to "info" variant with Clock icon (waiting on payment provider)', () => {
    const config = purchaseStatusConfig[PurchaseStatus.Pending]

    expect(config.variant).toBe('info')
    expect(config.label).toBe('Pending')
    expect(typeof config.icon).toBe('function')
  })

  it('maps PurchaseStatus.Failed to "destructive" variant with XCircle icon', () => {
    const config = purchaseStatusConfig[PurchaseStatus.Failed]

    expect(config.variant).toBe('destructive')
    expect(config.label).toBe('Failed')
    expect(typeof config.icon).toBe('function')
  })

  it('maps PurchaseStatus.Refunded to "muted" variant with RefreshCcw icon', () => {
    const config = purchaseStatusConfig[PurchaseStatus.Refunded]

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Refunded')
    expect(typeof config.icon).toBe('function')
  })

  it('maps PurchaseStatus.PartialRefund to "warning" variant with RefreshCw icon', () => {
    const config = purchaseStatusConfig[PurchaseStatus.PartialRefund]

    expect(config.variant).toBe('warning')
    expect(config.label).toBe('Partial Refund')
    expect(typeof config.icon).toBe('function')
  })

  it('covers all PurchaseStatus enum values', () => {
    const configuredStatuses = Object.keys(purchaseStatusConfig)
    const allStatuses = Object.values(PurchaseStatus)

    expect(configuredStatuses).toHaveLength(allStatuses.length)
    for (const status of allStatuses) {
      expect(purchaseStatusConfig[status]).toMatchObject({
        label: expect.any(String),
        variant: expect.any(String),
      })
    }
  })
})

describe('activeStatusConfig', () => {
  it('maps "active" to "success" variant with Check icon', () => {
    const config = activeStatusConfig.active

    expect(config.variant).toBe('success')
    expect(config.label).toBe('Active')
    expect(typeof config.icon).toBe('function')
  })

  it('maps "inactive" to "muted" variant with X icon', () => {
    const config = activeStatusConfig.inactive

    expect(config.variant).toBe('muted')
    expect(config.label).toBe('Inactive')
    expect(typeof config.icon).toBe('function')
  })

  it('covers all ActiveStatus values', () => {
    const configuredStatuses = Object.keys(activeStatusConfig)
    const allStatuses: ActiveStatus[] = ['active', 'inactive']

    expect(configuredStatuses).toHaveLength(allStatuses.length)
    for (const status of allStatuses) {
      expect(activeStatusConfig[status]).toMatchObject({
        label: expect.any(String),
        variant: expect.any(String),
      })
    }
  })
})
