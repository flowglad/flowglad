/**
 * Automatic Environment Variable Tracker
 *
 * Captures the entire process.env at test start and automatically restores
 * it in afterEach. This ensures tests cannot leak environment variable changes.
 *
 * This is used internally by the test setup files - tests don't need to
 * explicitly use this utility.
 *
 * @example
 * // In a setup file:
 * ```typescript
 * import { createAutoEnvTracker } from '@/test/isolation/envTracker'
 *
 * const envTracker = createAutoEnvTracker()
 *
 * beforeEach(() => {
 *   envTracker.startTracking()
 * })
 *
 * afterEach(() => {
 *   envTracker.restoreAll()
 * })
 * ```
 */

export function createAutoEnvTracker() {
  let originalEnv: Record<string, string | undefined> = {}

  return {
    /**
     * Captures the current process.env state.
     * Call this at the start of each test (in beforeEach).
     */
    startTracking(): void {
      originalEnv = { ...process.env }
    },

    /**
     * Restores process.env to its captured state.
     * - Removes variables that were added during the test
     * - Restores variables that were modified during the test
     * - Deletes variables that were deleted during the test
     *
     * Call this at the end of each test (in afterEach).
     */
    restoreAll(): void {
      // Get current keys to find added variables
      const currentKeys = Object.keys(process.env)

      // Remove any variables that were added during the test
      for (const key of currentKeys) {
        if (!(key in originalEnv)) {
          delete process.env[key]
        }
      }

      // Restore original values (including deleted ones)
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }

      // Clear the captured state
      originalEnv = {}
    },
  }
}
