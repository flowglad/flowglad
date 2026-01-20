import { adminTransaction } from './adminTransaction'
import type { AdminTransactionParams } from './types'

interface TestTransactionOptions {
  livemode?: boolean
}

/**
 * Test-only transaction wrapper that unwraps Results for cleaner test syntax.
 * Use this in tests instead of manually calling .unwrap() after every transaction.
 *
 * This wrapper:
 * - Executes the function within an admin transaction
 * - Automatically unwraps the Result, throwing if there was an error
 * - Defaults to livemode: false for test environment
 *
 * @example
 * ```typescript
 * // Instead of:
 * const result = (await adminTransaction(async ({ transaction }) => {
 *   return selectCustomerById(customerId, transaction)
 * }, { livemode: false })).unwrap()
 *
 * // Use:
 * const result = await testTransaction(async ({ transaction }) => {
 *   return selectCustomerById(customerId, transaction)
 * })
 * ```
 */
export async function testTransaction<T>(
  fn: (params: AdminTransactionParams) => Promise<T>,
  options: TestTransactionOptions = {}
): Promise<T> {
  const { livemode = false } = options
  return (await adminTransaction(fn, { livemode })).unwrap()
}
