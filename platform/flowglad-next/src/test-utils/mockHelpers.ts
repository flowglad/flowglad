import type { Mock } from 'bun:test'

/**
 * Type helper to cast a mocked function to its Mock type.
 * Replacement for vi.mocked() which doesn't exist in bun:test.
 */
export const asMock = <T extends (...args: unknown[]) => unknown>(
  fn: T
): Mock<T> => {
  return fn as unknown as Mock<T>
}
