import { afterAll, afterEach, beforeAll, mock } from 'bun:test'
import { webcrypto } from 'node:crypto'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { cleanup } from '@testing-library/react'
import { server } from './mocks/server'
import { seedDatabase } from './seedDatabase'

GlobalRegistrator.register()

import { expect } from 'bun:test'
import * as matchers from '@testing-library/jest-dom/matchers'

expect.extend(matchers)

mock.module('server-only', () => ({}))

mock.module('@trigger.dev/core', () => ({
  idempotencyKeys: {
    create: async (key: string) => `mock-${key}-${Math.random()}`,
  },
}))

process.env.UNKEY_API_ID = process.env.UNKEY_API_ID || 'api_test_mock'
process.env.UNKEY_ROOT_KEY =
  process.env.UNKEY_ROOT_KEY || 'unkey_test_mock'

if (!global.crypto) {
  global.crypto = webcrypto as unknown as Crypto
}

beforeAll(async () => {
  if (!global.crypto) {
    global.crypto = webcrypto as unknown as Crypto
  }
  server.listen({ onUnhandledRequest: 'warn' })
  await seedDatabase()
})

afterEach(() => {
  server.resetHandlers()
  cleanup()
})

afterAll(async () => {
  server.close()
})
