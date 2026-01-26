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

declare global {
  // eslint-disable-next-line no-var
  /**
   * Mocked auth session for testing.
   * Set by tests to control what getSession() returns.
   * Automatically reset to null after each test by globalStateGuard.
   */
  var __mockedAuthSession:
    | null
    | { user: { id: string; email: string } }
    | undefined
}

// Ensure this file is treated as a module
export {}
