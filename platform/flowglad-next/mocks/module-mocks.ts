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
 *
 * NOTE: Trigger.dev tasks are NOT mocked here. They route to the mock server
 * via TRIGGER_API_URL when set in .env.test.
 */
import { mock } from 'bun:test'

// Mock server-only module (used by Next.js server components)
mock.module('server-only', () => ({}))

// Mock auth module with globally-controllable sessions
// Tests can set:
// - `globalThis.__mockedAuthSession` for legacy getSession() (backward compatibility)
// - `globalThis.__mockedMerchantSession` for getMerchantSession()
// - `globalThis.__mockedCustomerSession` for getCustomerSession()
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
  merchantAuth: {
    api: {
      getSession: async () => globalThis.__mockedMerchantSession,
    },
  },
  customerAuth: {
    api: {
      getSession: async () => globalThis.__mockedCustomerSession,
    },
  },
  getSession: async () => globalThis.__mockedAuthSession,
  getMerchantSession: async () => globalThis.__mockedMerchantSession,
  getCustomerSession: async () => globalThis.__mockedCustomerSession,
  // Constants
  MERCHANT_COOKIE_PREFIX: 'merchant',
  CUSTOMER_COOKIE_PREFIX: 'customer',
  MERCHANT_AUTH_BASE_PATH: '/api/auth/merchant',
  CUSTOMER_AUTH_BASE_PATH: '/api/auth/customer',
}))
