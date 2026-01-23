/**
 * Test Isolation Utilities
 *
 * This module provides utilities for ensuring tests don't share state, which
 * is critical for parallel test execution. Key areas of isolation:
 *
 * 1. Environment variables - Tests that modify process.env must restore original values
 * 2. Global mocks - Tests using globalThis.__mock* patterns need cleanup
 * 3. Auth session state - The global __mockedAuthSession must be reset
 *
 * @example
 * ```typescript
 * import { preserveEnv, resetGlobalTestState } from '@/test/helpers/testIsolation'
 *
 * describe('MyFeature', () => {
 *   let restoreEnv: () => void
 *
 *   beforeEach(() => {
 *     restoreEnv = preserveEnv(['MY_VAR', 'OTHER_VAR'])
 *     process.env.MY_VAR = 'test-value'
 *   })
 *
 *   afterEach(() => {
 *     restoreEnv()
 *     resetGlobalTestState()
 *   })
 * })
 * ```
 */

/**
 * Preserves environment variables and returns a function to restore them.
 * Use this when tests need to modify process.env temporarily.
 *
 * @param keys - Array of environment variable names to preserve
 * @returns A function that restores the original values (including deletion if undefined)
 *
 * @example
 * ```typescript
 * const restore = preserveEnv(['API_KEY', 'DEBUG'])
 * process.env.API_KEY = 'test-key'
 * // ... run test ...
 * restore() // API_KEY restored to original or deleted if it didn't exist
 * ```
 */
export function preserveEnv(keys: string[]): () => void {
  const originalValues = new Map<string, string | undefined>()

  for (const key of keys) {
    originalValues.set(key, process.env[key])
  }

  return () => {
    for (const [key, value] of originalValues) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

/**
 * Creates a scoped environment modification helper that automatically
 * cleans up when the test ends.
 *
 * @example
 * ```typescript
 * const env = createScopedEnv()
 * env.set('API_KEY', 'test-value')
 * env.set('DEBUG', 'true')
 * // ... run test ...
 * env.restore() // All modifications are undone
 * ```
 */
export function createScopedEnv() {
  const modifications = new Map<string, string | undefined>()

  return {
    /**
     * Sets an environment variable, tracking the original value for restoration.
     */
    set(key: string, value: string): void {
      if (!modifications.has(key)) {
        modifications.set(key, process.env[key])
      }
      process.env[key] = value
    },

    /**
     * Deletes an environment variable, tracking it for restoration.
     */
    delete(key: string): void {
      if (!modifications.has(key)) {
        modifications.set(key, process.env[key])
      }
      delete process.env[key]
    },

    /**
     * Restores all modified environment variables to their original values.
     */
    restore(): void {
      for (const [key, originalValue] of modifications) {
        if (originalValue === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = originalValue
        }
      }
      modifications.clear()
    },
  }
}

/**
 * Resets all known global test state to clean defaults.
 * Call this in afterEach to ensure tests don't leak state.
 *
 * This resets:
 * - globalThis.__mockedAuthSession (auth mocking)
 * - Any globalThis.__mock* properties (common pattern for task mocks)
 *
 * Note: This delegates to resetAllGlobalMocks from globalStateGuard.ts which:
 * - Clears (not deletes) mocks registered by mock.module() in bun.mocks.ts
 * - Deletes __mock* globals added by individual tests
 */
export function resetGlobalTestState(): void {
  // Import dynamically to avoid circular dependencies
  // This ensures we use the same logic as the setup files
  const {
    resetAllGlobalMocks,
  } = require('@/test/isolation/globalStateGuard')
  resetAllGlobalMocks()
}

/**
 * Sets up a mock auth session for testing.
 * The session is automatically available to code that calls getSession().
 *
 * @param user - The user object to include in the session
 * @returns A cleanup function that resets the session to null
 *
 * @example
 * ```typescript
 * const cleanup = setMockAuthSession({ id: 'user_123', email: 'test@example.com' })
 * // ... run test that needs authenticated user ...
 * cleanup()
 * ```
 */
export function setMockAuthSession(user: {
  id: string
  email: string
}): () => void {
  globalThis.__mockedAuthSession = { user }
  return () => {
    globalThis.__mockedAuthSession = null
  }
}

/**
 * Creates a test context that bundles common isolation utilities.
 * Use this for tests that need multiple isolation features.
 *
 * @example
 * ```typescript
 * describe('ComplexFeature', () => {
 *   let ctx: ReturnType<typeof createTestContext>
 *
 *   beforeEach(() => {
 *     ctx = createTestContext()
 *     ctx.env.set('FEATURE_FLAG', 'enabled')
 *     ctx.setAuth({ id: 'user_123', email: 'test@example.com' })
 *   })
 *
 *   afterEach(() => {
 *     ctx.cleanup()
 *   })
 *
 *   it('does something with the feature', async () => {
 *     // Test runs with isolated env and auth
 *   })
 * })
 * ```
 */
export function createTestContext() {
  const env = createScopedEnv()
  const cleanupFns: Array<() => void> = []

  return {
    /**
     * Scoped environment variable manager.
     */
    env,

    /**
     * Sets the mock auth session and tracks it for cleanup.
     */
    setAuth(user: { id: string; email: string }): void {
      cleanupFns.push(setMockAuthSession(user))
    },

    /**
     * Registers a custom cleanup function to be called during cleanup.
     */
    onCleanup(fn: () => void): void {
      cleanupFns.push(fn)
    },

    /**
     * Runs all cleanup functions in reverse order (LIFO).
     * Call this in afterEach.
     */
    cleanup(): void {
      // Run custom cleanup functions in reverse order
      for (let i = cleanupFns.length - 1; i >= 0; i--) {
        cleanupFns[i]()
      }
      cleanupFns.length = 0

      // Restore environment variables
      env.restore()

      // Reset any remaining global state
      resetGlobalTestState()
    },
  }
}

/**
 * Type declaration for the global auth session mock.
 * This is set in bun.setup.ts and used by the auth module mock.
 */
declare global {
  // eslint-disable-next-line no-var
  var __mockedAuthSession:
    | null
    | { user: { id: string; email: string } }
    | undefined
}
