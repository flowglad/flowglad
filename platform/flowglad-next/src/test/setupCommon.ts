/**
 * Common Test Setup Utilities
 *
 * Provides shared lifecycle hooks for test isolation. These utilities
 * handle common tasks like environment variable restoration, spy cleanup,
 * global mock state reset, and MSW server management.
 *
 * Usage:
 * ```typescript
 * import { createTestLifecycle } from '@/test/setupCommon'
 *
 * const lifecycle = createTestLifecycle()
 *
 * beforeAll(() => lifecycle.beforeAll())
 * beforeEach(() => lifecycle.beforeEach())
 * afterEach(() => lifecycle.afterEach())
 * afterAll(() => lifecycle.afterAll())
 * ```
 */

import { cleanup } from '@testing-library/react'
import { createAutoEnvTracker } from '@/test/isolation/envTracker'
import {
  initializeGlobalMockState,
  resetAllGlobalMocks,
} from '@/test/isolation/globalStateGuard'
import { globalSpyManager } from '@/test/isolation/spyManager'
import { server } from '../../mocks/server'

export interface TestLifecycleOptions {
  /**
   * MSW unhandled request behavior.
   * - 'error': Fail the test (strict mode - use for unit/db tests)
   * - 'warn': Log a warning (use for legacy tests)
   * - 'bypass': Silently allow (use for integration tests)
   */
  mswMode?: 'error' | 'warn' | 'bypass'

  /**
   * Whether to run React Testing Library cleanup.
   * Default: true
   */
  reactCleanup?: boolean
}

/**
 * Creates a test lifecycle manager with standard isolation hooks.
 *
 * @param options Configuration options
 * @returns An object with beforeAll, beforeEach, afterEach, and afterAll hooks
 */
export function createTestLifecycle(
  options: TestLifecycleOptions = {}
) {
  const { mswMode = 'error', reactCleanup = true } = options
  const envTracker = createAutoEnvTracker()

  return {
    /**
     * Call in beforeAll. Starts MSW server and initializes global mock state.
     */
    beforeAll(): void {
      server.listen({ onUnhandledRequest: mswMode })
      initializeGlobalMockState()
    },

    /**
     * Call in beforeEach. Starts environment variable tracking.
     */
    beforeEach(): void {
      envTracker.startTracking()
    },

    /**
     * Call in afterEach. Restores all test isolation state.
     */
    afterEach(): void {
      // Reset MSW handlers
      server.resetHandlers()

      // Cleanup React testing-library (if enabled)
      if (reactCleanup) {
        cleanup()
      }

      // Auto-restore all tracked spies (does not affect mock.module)
      globalSpyManager.restoreAll()

      // Auto-restore all environment variable changes
      envTracker.restoreAll()

      // Reset all global mock state (__mockedAuthSession, __mock*, etc.)
      resetAllGlobalMocks()
    },

    /**
     * Call in afterAll. Closes MSW server.
     */
    afterAll(): void {
      server.close()
    },

    /**
     * Access to the env tracker for manual control if needed.
     */
    envTracker,
  }
}

/**
 * Standard test lifecycle for strict isolation (unit tests, db tests).
 * MSW will fail tests on unhandled requests.
 */
export const strictLifecycle = createTestLifecycle({
  mswMode: 'error',
})

/**
 * Permissive test lifecycle for legacy tests.
 * MSW will warn on unhandled requests but not fail.
 */
export const permissiveLifecycle = createTestLifecycle({
  mswMode: 'warn',
})
