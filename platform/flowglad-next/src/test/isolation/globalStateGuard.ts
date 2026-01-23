/**
 * Global State Guard
 *
 * Manages global mock state for test isolation. The key insight is that some
 * __mock* globals are set up by mock.module() at module load time and should
 * PERSIST across tests (only cleared, not deleted). Other __mock* globals may
 * be added by individual tests and should be DELETED after each test.
 *
 * This module tracks which globals existed at initialization (from mock.module())
 * and handles them appropriately during reset.
 */

declare global {
  // eslint-disable-next-line no-var
  var __mockedAuthSession:
    | null
    | { user: { id: string; email: string } }
    | undefined
}

/**
 * Set of __mock* global keys that existed at initialization time.
 * These were set up by mock.module() and should persist across tests.
 */
let initialMockGlobals: Set<string> = new Set()

/**
 * Whether initialization has been called.
 */
let initialized = false

/**
 * Initializes global mock state tracking.
 * Call this once in beforeAll, AFTER mock.module() calls have run.
 *
 * This captures which __mock* globals exist at startup so we know
 * which ones to preserve (clear, not delete) during reset.
 */
export function initializeGlobalMockState(): void {
  globalThis.__mockedAuthSession = null

  // Capture all __mock* globals that exist at initialization
  // These were set up by mock.module() and should persist
  initialMockGlobals = new Set()
  const globalKeys = Object.keys(globalThis)
  for (const key of globalKeys) {
    if (key.startsWith('__mock')) {
      initialMockGlobals.add(key)
    }
  }

  initialized = true
}

/**
 * Resets all global mock state to clean defaults.
 *
 * For __mock* globals that existed at initialization (from mock.module()):
 * - Calls mockClear() if available (preserves mock but clears call history)
 * - Does NOT delete them (they need to persist for subsequent tests)
 *
 * For __mock* globals added during tests:
 * - Deletes them entirely
 *
 * Called automatically by setup files in afterEach.
 */
export function resetAllGlobalMocks(): void {
  // Reset the auth session mock to null (default state)
  globalThis.__mockedAuthSession = null

  const globalKeys = Object.keys(globalThis)
  for (const key of globalKeys) {
    if (key.startsWith('__mock') && key !== '__mockedAuthSession') {
      const value = (globalThis as Record<string, unknown>)[key]

      if (initialized && initialMockGlobals.has(key)) {
        // This global existed at initialization (from mock.module())
        // Clear it rather than delete it
        if (
          value &&
          typeof value === 'object' &&
          'mockClear' in value
        ) {
          const mock = value as { mockClear: () => void }
          mock.mockClear()
        }
        // Don't delete - the mock needs to persist for subsequent tests
      } else {
        // This global was added during a test - delete it
        delete (globalThis as Record<string, unknown>)[key]
      }
    }
  }
}
