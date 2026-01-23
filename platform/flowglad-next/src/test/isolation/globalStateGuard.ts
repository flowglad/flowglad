/**
 * Global State Guard
 *
 * Resets all known global mock state to clean defaults.
 * This ensures tests don't leak state through globalThis.__mock* patterns.
 *
 * This is used internally by setup files - tests don't need to call this directly.
 */

declare global {
  // eslint-disable-next-line no-var
  var __mockedAuthSession:
    | null
    | { user: { id: string; email: string } }
    | undefined
}

/**
 * Resets all known global mock state patterns.
 *
 * This function:
 * 1. Resets __mockedAuthSession to null (default unauthenticated state)
 * 2. Deletes any globalThis.__mock* properties (trigger task mocks, etc.)
 *
 * Called automatically by setup files in afterEach.
 */
export function resetAllGlobalMocks(): void {
  // Reset the auth session mock to null (default state)
  globalThis.__mockedAuthSession = null

  // Clean up any __mock* globals that tests may have set
  // These are commonly used for mocking trigger tasks and notifications
  const globalKeys = Object.keys(globalThis)
  for (const key of globalKeys) {
    if (key.startsWith('__mock') && key !== '__mockedAuthSession') {
      delete (globalThis as Record<string, unknown>)[key]
    }
  }
}

/**
 * Initializes global mock state to safe defaults.
 * Call this once at the start of test setup.
 */
export function initializeGlobalMockState(): void {
  globalThis.__mockedAuthSession = null
}
