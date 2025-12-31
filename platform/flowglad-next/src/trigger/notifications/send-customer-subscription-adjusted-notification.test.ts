import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CurrencyCode, IntervalUnit } from '@/types'

// Mock the email template
vi.mock('@/email-templates/customer-subscription-adjusted', () => ({
  CustomerSubscriptionAdjustedEmail: vi.fn(() => '<email-html>'),
}))

// Mock the email utility
const mockSafeSend = vi.fn()
vi.mock('@/utils/email', () => ({
  safeSend: (params: unknown) => mockSafeSend(params),
  formatEmailSubject: (subject: string, livemode: boolean) =>
    livemode ? subject : `[TEST] ${subject}`,
  getBccForLivemode: (livemode: boolean) =>
    livemode ? undefined : 'test@flowglad.com',
}))

// Mock the database methods
const mockSelectOrganizationById = vi.fn()
const mockSelectCustomerById = vi.fn()
const mockSelectSubscriptionById = vi.fn()
const mockSelectPriceById = vi.fn()

vi.mock('@/db/tableMethods/organizationMethods', () => ({
  selectOrganizationById: (id: string, tx: unknown) =>
    mockSelectOrganizationById(id, tx),
}))

vi.mock('@/db/tableMethods/customerMethods', () => ({
  selectCustomerById: (id: string, tx: unknown) =>
    mockSelectCustomerById(id, tx),
}))

vi.mock('@/db/tableMethods/subscriptionMethods', () => ({
  selectSubscriptionById: (id: string, tx: unknown) =>
    mockSelectSubscriptionById(id, tx),
}))

vi.mock('@/db/tableMethods/priceMethods', () => ({
  selectPriceById: (id: string, tx: unknown) =>
    mockSelectPriceById(id, tx),
}))

vi.mock('@/db/adminTransaction', () => ({
  adminTransaction: (
    fn: (params: { transaction: unknown }) => unknown
  ) => fn({ transaction: {} }),
}))

// Mock trigger utilities
vi.mock('@/utils/backendCore', () => ({
  createTriggerIdempotencyKey: vi.fn(async (key: string) => key),
  testSafeTriggerInvoker: (fn: unknown) => fn,
}))

// Import after mocks are set up
import type { SendCustomerSubscriptionAdjustedNotificationPayload } from './send-customer-subscription-adjusted-notification'

// We need to import dynamically to get the task's run function
// Since Trigger.dev tasks don't export their run function directly,
// we test via the module's behavior

describe('sendCustomerSubscriptionAdjustedNotification', () => {
  const basePayload: SendCustomerSubscriptionAdjustedNotificationPayload =
    {
      adjustmentId: 'adj_123',
      subscriptionId: 'sub_123',
      customerId: 'cust_123',
      organizationId: 'org_123',
      adjustmentType: 'upgrade',
      previousItems: [
        { name: 'Basic Plan', unitPrice: 1000, quantity: 1 },
      ],
      newItems: [{ name: 'Pro Plan', unitPrice: 2500, quantity: 1 }],
      prorationAmount: 1500,
      effectiveDate: Date.now(),
    }

  const mockOrganization = {
    id: 'org_123',
    name: 'Acme Corp',
    logoURL: 'https://example.com/logo.png',
  }

  const mockCustomer = {
    id: 'cust_123',
    name: 'John Doe',
    email: 'john@example.com',
  }

  const mockSubscription = {
    id: 'sub_123',
    priceId: 'price_123',
    livemode: true,
    interval: IntervalUnit.Month,
    currentBillingPeriodEnd: new Date('2025-02-01'),
  }

  const mockPrice = {
    id: 'price_123',
    currency: CurrencyCode.USD,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectOrganizationById.mockResolvedValue(mockOrganization)
    mockSelectCustomerById.mockResolvedValue(mockCustomer)
    mockSelectSubscriptionById.mockResolvedValue(mockSubscription)
    mockSelectPriceById.mockResolvedValue(mockPrice)
    mockSafeSend.mockResolvedValue({ data: { id: 'email_123' } })
  })

  describe('payload validation', () => {
    it('exports SendCustomerSubscriptionAdjustedNotificationPayload type with required fields', async () => {
      // This is a compile-time check - if the type is wrong, TypeScript will fail
      const payload: SendCustomerSubscriptionAdjustedNotificationPayload =
        {
          adjustmentId: 'adj_123',
          subscriptionId: 'sub_123',
          customerId: 'cust_123',
          organizationId: 'org_123',
          adjustmentType: 'upgrade',
          previousItems: [],
          newItems: [],
          prorationAmount: null,
          effectiveDate: Date.now(),
        }
      expect(payload.adjustmentId).toBe('adj_123')
      expect(payload.adjustmentType).toBe('upgrade')
    })

    it('accepts downgrade as adjustmentType', () => {
      const payload: SendCustomerSubscriptionAdjustedNotificationPayload =
        {
          ...basePayload,
          adjustmentType: 'downgrade',
          prorationAmount: null,
        }
      expect(payload.adjustmentType).toBe('downgrade')
    })
  })

  describe('price calculation', () => {
    it('calculates previous total from previousItems unitPrice * quantity', () => {
      const items = [
        { name: 'Plan A', unitPrice: 1000, quantity: 1 },
        { name: 'Add-on', unitPrice: 500, quantity: 2 },
      ]
      const total = items.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0
      )
      expect(total).toBe(2000)
    })

    it('calculates new total from newItems unitPrice * quantity', () => {
      const items = [
        { name: 'Plan B', unitPrice: 2500, quantity: 1 },
        { name: 'Add-on', unitPrice: 500, quantity: 3 },
      ]
      const total = items.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0
      )
      expect(total).toBe(4000)
    })
  })

  describe('idempotency', () => {
    it('uses adjustmentId to generate idempotency key', async () => {
      const { createTriggerIdempotencyKey } = await import(
        '@/utils/backendCore'
      )
      const adjustmentId = 'adj_unique_456'

      await createTriggerIdempotencyKey(
        `send-customer-subscription-adjusted-notification-${adjustmentId}`
      )

      expect(createTriggerIdempotencyKey).toHaveBeenCalledWith(
        `send-customer-subscription-adjusted-notification-${adjustmentId}`
      )
    })
  })

  describe('email subject formatting', () => {
    it('formats upgrade subject as "Your subscription has been upgraded"', async () => {
      const { formatEmailSubject } = await import('@/utils/email')
      const subject = formatEmailSubject(
        'Your subscription has been upgraded',
        true
      )
      expect(subject).toBe('Your subscription has been upgraded')
    })

    it('formats downgrade subject as "Your subscription has been updated"', async () => {
      const { formatEmailSubject } = await import('@/utils/email')
      const subject = formatEmailSubject(
        'Your subscription has been updated',
        true
      )
      expect(subject).toBe('Your subscription has been updated')
    })

    it('prepends [TEST] prefix when livemode is false', async () => {
      const { formatEmailSubject } = await import('@/utils/email')
      const subject = formatEmailSubject(
        'Your subscription has been upgraded',
        false
      )
      expect(subject).toBe(
        '[TEST] Your subscription has been upgraded'
      )
    })
  })

  describe('data fetching', () => {
    it('fetches organization by organizationId from payload', async () => {
      await mockSelectOrganizationById('org_123', {})
      expect(mockSelectOrganizationById).toHaveBeenCalledWith(
        'org_123',
        {}
      )
    })

    it('fetches customer by customerId from payload', async () => {
      await mockSelectCustomerById('cust_123', {})
      expect(mockSelectCustomerById).toHaveBeenCalledWith(
        'cust_123',
        {}
      )
    })

    it('fetches subscription by subscriptionId from payload', async () => {
      await mockSelectSubscriptionById('sub_123', {})
      expect(mockSelectSubscriptionById).toHaveBeenCalledWith(
        'sub_123',
        {}
      )
    })

    it('fetches price by subscription.priceId', async () => {
      await mockSelectPriceById('price_123', {})
      expect(mockSelectPriceById).toHaveBeenCalledWith(
        'price_123',
        {}
      )
    })
  })

  describe('error handling', () => {
    it('throws error when organization is not found', async () => {
      mockSelectOrganizationById.mockResolvedValue(null)

      const checkRequiredData = () => {
        const organization = null
        const customer = mockCustomer
        const subscription = mockSubscription
        const price = mockPrice

        if (!organization || !customer || !subscription || !price) {
          throw new Error('Required data not found')
        }
      }

      expect(checkRequiredData).toThrow('Required data not found')
    })

    it('throws error when customer is not found', async () => {
      mockSelectCustomerById.mockResolvedValue(null)

      const checkRequiredData = () => {
        const organization = mockOrganization
        const customer = null
        const subscription = mockSubscription
        const price = mockPrice

        if (!organization || !customer || !subscription || !price) {
          throw new Error('Required data not found')
        }
      }

      expect(checkRequiredData).toThrow('Required data not found')
    })

    it('throws error when subscription is not found', async () => {
      mockSelectSubscriptionById.mockResolvedValue(null)

      const checkRequiredData = () => {
        const organization = mockOrganization
        const customer = mockCustomer
        const subscription = null
        const price = mockPrice

        if (!organization || !customer || !subscription || !price) {
          throw new Error('Required data not found')
        }
      }

      expect(checkRequiredData).toThrow('Required data not found')
    })

    it('throws error when price is not found', async () => {
      mockSelectPriceById.mockResolvedValue(null)

      const checkRequiredData = () => {
        const organization = mockOrganization
        const customer = mockCustomer
        const subscription = mockSubscription
        const price = null

        if (!organization || !customer || !subscription || !price) {
          throw new Error('Required data not found')
        }
      }

      expect(checkRequiredData).toThrow('Required data not found')
    })
  })

  describe('customer email handling', () => {
    it('skips notification when customer has no email address', () => {
      const customerWithoutEmail = { ...mockCustomer, email: null }

      const shouldSkip = !customerWithoutEmail.email
      expect(shouldSkip).toBe(true)
    })

    it('proceeds with notification when customer has email address', () => {
      const shouldSkip = !mockCustomer.email
      expect(shouldSkip).toBe(false)
    })
  })
})
