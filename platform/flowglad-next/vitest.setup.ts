// vitest.setup.ts
import '@testing-library/jest-dom/vitest'
import { webcrypto } from 'node:crypto'
import { cleanup } from '@testing-library/react'
import { stripeServer } from './mocks/stripeServer'
import { triggerServer } from './mocks/triggerServer'
import { beforeAll, afterAll, afterEach, vi } from 'vitest'
import { seedDatabase } from './seedDatabase'
import { svixServer } from './mocks/svixServer'
import { unkeyServer } from './mocks/unkeyServer'

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
  console.log('Starting mock servers------')
  stripeServer.listen()
  triggerServer.listen()
  svixServer.listen()
  unkeyServer.listen()
  await seedDatabase()
})

// Reset handlers after each test (optional, but recommended)
afterEach(() => {
  stripeServer.resetHandlers()
  triggerServer.resetHandlers()
  svixServer.resetHandlers()
  unkeyServer.resetHandlers()
  cleanup()
})

// Stop the mock server after all tests
afterAll(async () => {
  stripeServer.close()
  triggerServer.close()
  svixServer.close()
  unkeyServer.close()
  //   await dropDatabase()
})
