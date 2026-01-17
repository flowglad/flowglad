import type { Mock } from 'bun:test'

/**
 * Type helper to cast a mocked function to its Mock type.
 * Replacement for vi.mocked() which doesn't exist in bun:test.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const asMock = <T extends (...args: any[]) => any>(
  fn: T
): Mock<T> => {
  return fn as unknown as Mock<T>
}
