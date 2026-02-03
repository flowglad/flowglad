/**
 * Consolidated Global Declarations for Test Infrastructure
 *
 * All test-related global variables should be declared here to:
 * 1. Avoid duplicate declarations across setup files
 * 2. Ensure TypeScript type consistency
 * 3. Document the purpose of each global
 *
 * IMPORTANT: These globals are managed by the test setup files.
 * Do not modify them directly in test code unless documented.
 */

/**
 * Session object structure for auth session mocks.
 */
interface MockedAuthSession {
  user: { id: string; email: string }
  session?: {
    scope?: 'merchant' | 'customer'
    contextOrganizationId?: string
  }
}

declare global {
  // eslint-disable-next-line no-var
  /**
   * Mocked auth session for testing (legacy - backward compatibility).
   * Set by tests to control what getSession() returns.
   * Automatically reset to null after each test by globalStateGuard.
   * @deprecated Use __mockedMerchantSession or __mockedCustomerSession instead
   */
  var __mockedAuthSession:
    | null
    | { user: { id: string; email: string } }
    | undefined

  /**
   * Mocked merchant session for testing.
   * Set by tests to control what getMerchantSession() returns.
   * Automatically reset to null after each test by globalStateGuard.
   */
  // eslint-disable-next-line no-var
  var __mockedMerchantSession: MockedAuthSession | null | undefined

  /**
   * Mocked customer session for testing.
   * Set by tests to control what getCustomerSession() returns.
   * Automatically reset to null after each test by globalStateGuard.
   */
  // eslint-disable-next-line no-var
  var __mockedCustomerSession: MockedAuthSession | null | undefined
}

// Ensure this file is treated as a module
export {}
