import { FlowgladServer } from '../../FlowgladServer'
import { FlowgladServerAdmin } from '../../FlowgladServerAdmin'
import type { CoreCustomerUser } from '../../types'

/**
 * Creates a mock FlowgladServer instance for testing
 */
export const createTestFlowgladServer = () => {
  return new FlowgladServer({
    apiKey: process.env.FLOWGLAD_SECRET_KEY,
    baseURL: process.env.FLOWGLAD_BASE_URL || 'http://localhost:3000',
    getRequestingCustomer: async (): Promise<CoreCustomerUser> => {
      return {
        externalId: 'test-user-id',
        name: 'Test User',
        email: 'test@example.com',
      }
    },
  })
}

/**
 * Waits for a specified amount of time
 */
export const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Retries a function until it succeeds or the maximum number of retries is reached
 */
export const retry = async <T>(
  fn: () => Promise<T>,
  maxRetries = 5,
  delay = 1000
): Promise<T> => {
  let lastError: Error | undefined

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      if (i < maxRetries - 1) {
        await wait(delay * (i + 1))
      }
    }
  }

  throw lastError
}

export const createTestFlowgladServerAdmin = () => {
  return new FlowgladServerAdmin({
    baseURL: process.env.FLOWGLAD_BASE_URL || 'http://localhost:3000',
  })
}
