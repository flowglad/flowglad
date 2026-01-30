import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { CurrencyCode } from '@db-core/enums'
import actualCore from '@/utils/core'

// Import actual modules before mocking
import * as actualEmail from '@/utils/email'
import { EMAIL_REGISTRY } from './registry'

// Mock the email module to control network calls
const mockResponse = {
  data: { id: 'mock-email-id' },
  error: null,
} as const

const mockSafeSend = mock<typeof actualEmail.safeSend>()
const mockEnvVariable = mock<typeof actualCore.envVariable>()

// Track calls per test to avoid cross-file interference
let lastSafeSendCall: {
  emailPayload: Parameters<typeof actualEmail.safeSend>[0]
  metadata: Parameters<typeof actualEmail.safeSend>[1]
} | null = null

mock.module('@/utils/email', () => ({
  ...actualEmail,
  safeSend: mockSafeSend,
}))

mock.module('@/utils/core', () => ({
  ...actualCore,
  default: {
    ...actualCore,
    envVariable: mockEnvVariable,
  },
}))

import {
  getDefaultSubject,
  getEmailConfig,
  sendEmail,
} from './sendEmail'

beforeEach(() => {
  lastSafeSendCall = null
  mockSafeSend.mockClear()
  mockSafeSend.mockImplementation(((emailPayload, metadata) => {
    lastSafeSendCall = { emailPayload, metadata }
    return Promise.resolve(mockResponse)
  }) as typeof actualEmail.safeSend)
  mockEnvVariable.mockClear()
  // Default: return test email for DEV_EMAIL_REDIRECT, undefined for others
  mockEnvVariable.mockImplementation(((key: string) => {
    if (key === 'DEV_EMAIL_REDIRECT') {
      return 'test-redirect@flowglad.com'
    }
    return undefined
  }) as any)
})

describe('sendEmail', () => {
  describe('validation', () => {
    it('validates props before sending when skipValidation is false', async () => {
      const invalidProps = {
        organizationName: '', // Empty string should fail validation
      }

      await expect(
        sendEmail({
          type: 'organization.notification.payouts-enabled',
          to: ['test@example.com'],
          props: invalidProps as never,
          livemode: true,
          skipValidation: false,
        })
      ).rejects.toThrow(/organization.notification.payouts-enabled/)
    })

    it('skips validation when skipValidation is true', async () => {
      const invalidProps = {
        organizationName: '', // Would normally fail
      }

      // Should not throw because validation is skipped
      // The actual send will still work because safeSend is mocked
      const result = await sendEmail({
        type: 'organization.notification.payouts-enabled',
        to: ['test@example.com'],
        props: invalidProps as never,
        livemode: true,
        skipValidation: true,
      })

      // Should have called safeSend and returned the mock response
      expect(result).toEqual(mockResponse)
      expect(mockSafeSend).toHaveBeenCalled()
    })
  })

  describe('subject computation', () => {
    it('uses defaultSubject string when no override provided', async () => {
      // organization.notification.payouts-enabled has a function defaultSubject
      await sendEmail({
        type: 'organization.notification.payouts-enabled',
        to: ['test@example.com'],
        props: {
          organizationName: 'Acme Inc',
        },
        livemode: true,
      })

      expect(lastSafeSendCall!.emailPayload.subject).toBe(
        'Payouts Enabled for Acme Inc'
      )
      expect(lastSafeSendCall!.metadata).toEqual({
        templateName: 'organization.notification.payouts-enabled',
      })
    })

    it('uses subjectOverride when provided', async () => {
      await sendEmail({
        type: 'organization.notification.payouts-enabled',
        to: ['test@example.com'],
        props: {
          organizationName: 'Acme Inc',
        },
        livemode: true,
        subjectOverride: 'Custom Subject',
      })

      expect(lastSafeSendCall!.emailPayload.subject).toBe(
        'Custom Subject'
      )
      expect(lastSafeSendCall!.metadata).toEqual({
        templateName: 'organization.notification.payouts-enabled',
      })
    })

    it('adds [TEST] prefix when livemode is false', async () => {
      await sendEmail({
        type: 'organization.notification.payouts-enabled',
        to: ['test@example.com'],
        props: {
          organizationName: 'Acme Inc',
        },
        livemode: false,
      })

      expect(lastSafeSendCall!.emailPayload.subject).toBe(
        '[TEST] Payouts Enabled for Acme Inc'
      )
      expect(lastSafeSendCall!.metadata).toEqual({
        templateName: 'organization.notification.payouts-enabled',
      })
    })
  })

  describe('from address', () => {
    it('uses organization branding for customer emails', async () => {
      await sendEmail({
        type: 'customer.subscription.created',
        to: ['customer@example.com'],
        props: {
          customerName: 'John Doe',
          organizationName: 'Acme Inc',
          organizationId: 'org_123',
          customerExternalId: 'cus_ext_123',
          planName: 'Pro Plan',
          price: 1999,
          currency: CurrencyCode.USD,
        },
        organizationName: 'Acme Inc',
        livemode: true,
      })

      expect(lastSafeSendCall!.emailPayload.from).toBe(
        'Acme Inc Billing <acme-inc-billing@flowglad.com>'
      )
      expect(lastSafeSendCall!.metadata).toEqual({
        templateName: 'customer.subscription.created',
      })
    })

    it('uses Flowglad branding for organization emails', async () => {
      await sendEmail({
        type: 'organization.notification.payouts-enabled',
        to: ['merchant@example.com'],
        props: {
          organizationName: 'Acme Inc',
        },
        livemode: true,
      })

      expect(lastSafeSendCall!.emailPayload.from).toBe(
        'Flowglad <notifications@flowglad.com>'
      )
      expect(lastSafeSendCall!.metadata).toEqual({
        templateName: 'organization.notification.payouts-enabled',
      })
    })
  })

  describe('template loading', () => {
    it('loads template lazily using getTemplate', async () => {
      // Verify that templates are loaded dynamically
      const config =
        EMAIL_REGISTRY['organization.notification.payouts-enabled']
      const template = await config.getTemplate()

      expect(typeof template).toBe('function')
    })
  })
})

describe('getDefaultSubject', () => {
  describe('with static subject', () => {
    it('returns the string subject for customer.auth.forgot-password', () => {
      const subject = getDefaultSubject(
        'customer.auth.forgot-password'
      )
      expect(subject).toBe('Reset your password')
    })

    it('returns the string subject for customer.payment.failed', () => {
      const subject = getDefaultSubject('customer.payment.failed')
      expect(subject).toBe('Your Payment Failed')
    })
  })

  describe('with dynamic subject', () => {
    it('computes subject for organization.notification.payouts-enabled', () => {
      const subject = getDefaultSubject(
        'organization.notification.payouts-enabled',
        {
          organizationName: 'Acme Inc',
        }
      )
      expect(subject).toBe('Payouts Enabled for Acme Inc')
    })

    it('computes subject for organization.subscription.created', () => {
      const subject = getDefaultSubject(
        'organization.subscription.created',
        {
          organizationName: 'Acme Inc',
          subscriptionName: 'Pro Plan',
          customerId: 'cus_123',
          customerName: 'John Doe',
          customerEmail: 'john@example.com',
          livemode: true,
        }
      )
      expect(subject).toBe(
        'New Subscription: John Doe subscribed to Pro Plan'
      )
    })

    it('throws error when props required but not provided', () => {
      expect(() =>
        getDefaultSubject('organization.notification.payouts-enabled')
      ).toThrow(/Props are required/)
    })
  })
})

describe('getEmailConfig', () => {
  it('returns config without getTemplate function', () => {
    const config = getEmailConfig(
      'organization.notification.payouts-enabled'
    )

    expect(config.recipientType).toBe('organization')
    expect(config.category).toBe('notification')
    expect(config.description).toContain('payouts')
    expect(config.requiresAwait).toBe(true)
    expect(
      (config as Record<string, unknown>).getTemplate
    ).toBeUndefined()
  })

  it('returns correct config for customer email', () => {
    const config = getEmailConfig('customer.subscription.created')

    expect(config.recipientType).toBe('customer')
    expect(config.category).toBe('subscription')
    expect(config.requiresAwait).toBe(true)
  })
})
