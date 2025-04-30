// vitest.setup.ts
import '@testing-library/jest-dom/vitest'
import { webcrypto } from 'node:crypto'
import { cleanup } from '@testing-library/react'
import { stripeServer } from './mocks/stripeServer'
import { triggerServer } from './mocks/triggerServer'
import { beforeAll, afterAll, afterEach, vi } from 'vitest'
import { seedDatabase } from './seedDatabase'

// Polyfill crypto for Node.js environment
// needed for github actions
if (!global.crypto) {
  global.crypto = webcrypto as unknown as Crypto
}

// Ensure crypto is available before mocking idempotencyKeys
beforeAll(() => {
  if (!global.crypto) {
    global.crypto = webcrypto as unknown as Crypto
  }
})

// Mock idempotencyKeys.create to return a predictable value
vi.mock('@trigger.dev/core', async () => {
  return {
    idempotencyKeys: {
      create: vi
        .fn()
        .mockImplementation(
          async (key: string) => `mock-${key}-${Math.random()}`
        ),
    },
  }
})

// Start the mock server before all tests
beforeAll(async () => {
  stripeServer.listen()
  triggerServer.listen()
  await seedDatabase()
})

// Reset handlers after each test (optional, but recommended)
afterEach(() => {
  stripeServer.resetHandlers()
  // triggerServer.resetHandlers()
  cleanup()
})

// Stop the mock server after all tests
afterAll(async () => {
  stripeServer.close()
  triggerServer.close()
  //   await dropDatabase()
})
