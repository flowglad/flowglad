import { afterEach, beforeEach, vi } from 'vitest'

/**
 * Suppresses expected hydration warnings from React Email components in jsdom.
 *
 * React Email uses <Html>, <Head>, and other components that don't follow
 * standard browser DOM hierarchy rules (e.g., <div> inside <html>).
 * These warnings are expected and don't affect functionality.
 *
 * @example
 * ```typescript
 * describe('MyEmail', () => {
 *   suppressEmailHydrationWarnings()
 *
 *   it('renders correctly', () => {
 *     // ... test code
 *   })
 * })
 * ```
 */
export function suppressEmailHydrationWarnings(): void {
  const originalError = console.error

  beforeEach(() => {
    console.error = vi.fn((...args: unknown[]) => {
      const message = args[0]
      if (
        typeof message === 'string' &&
        (message.includes('cannot be a child of') ||
          message.includes('cannot contain a nested'))
      ) {
        return
      }
      originalError.apply(console, args)
    })
  })

  afterEach(() => {
    console.error = originalError
  })
}
