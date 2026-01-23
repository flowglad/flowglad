/**
 * Spy Tracker Utility
 *
 * When using spyOn() alongside mock.module() in bun:test, you cannot use
 * mock.restore() globally - it undoes mock.module() overrides, breaking
 * subsequent tests. Instead, restore spies individually.
 *
 * This utility provides a clean pattern for tracking and restoring spies.
 *
 * @example
 * ```typescript
 * import { createSpyTracker } from '@/test/spyTracker'
 *
 * const tracker = createSpyTracker()
 *
 * beforeEach(() => {
 *   tracker.reset()
 *   tracker.track(spyOn(module, 'fn').mockResolvedValue(value))
 * })
 *
 * afterEach(() => {
 *   tracker.restoreAll()
 * })
 * ```
 */
export function createSpyTracker() {
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
     * Call this in afterEach().
     */
    restoreAll() {
      for (const spy of spies) {
        spy.mockRestore()
      }
      spies.length = 0
    },

    /**
     * Clear the tracking list without restoring spies.
     * Call this in beforeEach() if you need to reset tracking state.
     */
    reset() {
      spies.length = 0
    },
  }
}
