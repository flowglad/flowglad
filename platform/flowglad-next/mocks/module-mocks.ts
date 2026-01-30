/**
 * Common Module Mocks
 *
 * This file contains mock.module() calls for modules that need mocking
 * across all test types (unit, db, integration).
 *
 * IMPORTANT: Mock module registration order is critical in bun:test.
 * These mocks must be registered before any imports that transitively
 * load the mocked modules.
 *
 * Import this file FIRST in test setup files.
 */
import { type Mock, mock } from 'bun:test'

/**
 * Type declarations for global mock state.
 * These globals are set by mock.module() and persist across tests.
 * Tests can clear them with mockClear() but should not delete them.
 */
declare global {
  // eslint-disable-next-line no-var
  var __mockAttemptBillingRunTrigger: Mock<
    () => Promise<{ id: string }>
  >
  // eslint-disable-next-line no-var
  var __mockCustomerAdjustedNotification: Mock<
    () => Promise<undefined>
  >
  // eslint-disable-next-line no-var
  var __mockOrgAdjustedNotification: Mock<() => Promise<undefined>>
}

// Mock server-only module (used by Next.js server components)
mock.module('server-only', () => ({}))

// Mock auth module with a globally-controllable session
// Tests can set `globalThis.__mockedAuthSession` to control what getSession() returns
mock.module('@/utils/auth', () => ({
  auth: {
    api: {
      signInMagicLink: mock(async () => ({ success: true })),
      createUser: mock(async () => ({})),
      getSession: async () => globalThis.__mockedAuthSession,
      // Device authorization endpoints for CLI auth
      deviceApprove: mock(async () => ({ success: true })),
      deviceDeny: mock(async () => ({ success: true })),
      sendVerificationOTP: mock(async () => ({ success: true })),
    },
  },
  getSession: async () => globalThis.__mockedAuthSession,
}))

// Mock Trigger.dev idempotency keys
mock.module('@trigger.dev/core', () => ({
  idempotencyKeys: {
    create: async (key: string) => `mock-${key}-${Math.random()}`,
  },
}))

// Mock attempt-billing-run trigger task
// This must be centralized because multiple test files use it
const mockAttemptBillingRunTrigger =
  mock<() => Promise<{ id: string }>>()
mockAttemptBillingRunTrigger.mockResolvedValue({
  id: 'mock-billing-run-handle-id',
})
globalThis.__mockAttemptBillingRunTrigger =
  mockAttemptBillingRunTrigger
mock.module('@/trigger/attempt-billing-run', () => ({
  attemptBillingRunTask: {
    trigger: mockAttemptBillingRunTrigger,
  },
}))

// Mock customer subscription adjusted notification
const mockCustomerAdjustedNotification =
  mock<() => Promise<undefined>>()
mockCustomerAdjustedNotification.mockResolvedValue(undefined)
globalThis.__mockCustomerAdjustedNotification =
  mockCustomerAdjustedNotification
mock.module(
  '@/trigger/notifications/send-customer-subscription-adjusted-notification',
  () => ({
    idempotentSendCustomerSubscriptionAdjustedNotification:
      mockCustomerAdjustedNotification,
  })
)

// Mock organization subscription adjusted notification
const mockOrgAdjustedNotification = mock<() => Promise<undefined>>()
mockOrgAdjustedNotification.mockResolvedValue(undefined)
globalThis.__mockOrgAdjustedNotification = mockOrgAdjustedNotification
mock.module(
  '@/trigger/notifications/send-organization-subscription-adjusted-notification',
  () => ({
    idempotentSendOrganizationSubscriptionAdjustedNotification:
      mockOrgAdjustedNotification,
  })
)

// Mock payment notification modules
const mockPaymentNotification = mock<() => Promise<undefined>>()
mockPaymentNotification.mockResolvedValue(undefined)

mock.module(
  '@/trigger/notifications/send-organization-payment-succeeded-notification',
  () => ({
    sendOrganizationPaymentSucceededNotificationIdempotently:
      mockPaymentNotification,
  })
)

mock.module(
  '@/trigger/notifications/send-organization-payment-failed-notification',
  () => ({
    idempotentSendOrganizationPaymentFailedNotification:
      mockPaymentNotification,
    runSendOrganizationPaymentFailedNotification:
      mockPaymentNotification,
  })
)

mock.module(
  '@/trigger/notifications/send-customer-payment-succeeded-notification',
  () => ({
    sendCustomerPaymentSucceededNotificationIdempotently:
      mockPaymentNotification,
  })
)

mock.module(
  '@/trigger/notifications/send-customer-payment-failed-notification',
  () => ({
    sendCustomerPaymentFailedNotificationIdempotently:
      mockPaymentNotification,
  })
)
