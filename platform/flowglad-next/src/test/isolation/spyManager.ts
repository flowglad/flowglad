/**
 * Automatic Spy Manager
 *
 * Provides global spy tracking with automatic restoration. When using spyOn()
 * alongside mock.module() in bun:test, you cannot use mock.restore() globally -
 * it undoes mock.module() overrides. This manager tracks spies and restores
 * them individually.
 *
 * The globalSpyManager is used by setup files to automatically restore all
 * spies after each test. Test files can use trackSpy() to register spies.
 *
 * @example
 * ```typescript
 * import { trackSpy } from '@/test/isolation/spyManager'
 *
 * // In a test file:
 * beforeEach(() => {
 *   trackSpy(spyOn(someModule, 'someFunction').mockReturnValue('mocked'))
 * })
 * // No need to manually restore - setup file handles it
 * ```
 */

export function createAutoSpyManager() {
  const spies: Array<{ mockRestore: () => void }> = []

  return {
    /**
     * Track a spy for later restoration.
     * Returns the spy so it can be used inline with spyOn().
     */
    track<T extends { mockRestore: () => void }>(spy: T): T {
      spies.push(spy)
      return spy
    },

    /**
     * Restore all tracked spies and clear the tracking list.
     * Called automatically by setup files in afterEach.
     */
    restoreAll(): void {
      for (const spy of spies) {
        spy.mockRestore()
      }
      spies.length = 0
    },

    /**
     * Get the number of currently tracked spies.
     * Useful for debugging.
     */
    get count(): number {
      return spies.length
    },
  }
}

/**
 * Global spy manager instance used by setup files.
 */
export const globalSpyManager = createAutoSpyManager()

/**
 * Convenience function to track a spy with the global manager.
 * Use this in test files to automatically get spy cleanup.
 *
 * @example
 * ```typescript
 * import { trackSpy } from '@/test/isolation/spyManager'
 * import { spyOn } from 'bun:test'
 *
 * beforeEach(() => {
 *   trackSpy(spyOn(myModule, 'myFunction').mockResolvedValue('mocked'))
 * })
 * ```
 */
export function trackSpy<T extends { mockRestore: () => void }>(
  spy: T
): T {
  return globalSpyManager.track(spy)
}
