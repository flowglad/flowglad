/**
 * Frontend Test Setup (React/DOM tests)
 *
 * This setup file is for React component tests that need DOM APIs.
 * It uses happy-dom (fast DOM implementation) instead of jsdom.
 *
 * IMPORTANT: This file must be loaded AFTER bun.dom.preload.ts which sets up
 * the DOM globals. The test runner uses both preloads in order:
 *   --preload ./bun.dom.preload.ts --preload ./bun.frontend.setup.ts
 *
 * Use for: React components, hooks, DOM interactions
 * File pattern: *.test.tsx
 *
 * Features:
 * - happy-dom global registration (via bun.dom.preload.ts)
 * - jest-dom matchers extended on expect
 * - MSW in WARN mode (logs unhandled requests)
 * - React Testing Library cleanup after each test
 * - Environment variables auto-tracked and restored
 * - Spies auto-restored via globalSpyManager
 * - Global mock state reset after each test
 */

/// <reference lib="dom" />
/// <reference types="@testing-library/jest-dom" />

// IMPORTANT: Import mocks first (after DOM registration)
// This also sets test environment variable defaults (UNKEY_*, BETTER_AUTH_URL)
import './bun.mocks'

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
} from 'bun:test'
// Now import everything else
import { webcrypto } from 'node:crypto'
import * as matchers from '@testing-library/jest-dom/matchers'
import { cleanup } from '@testing-library/react'
import { createAutoEnvTracker } from '@/test/isolation/envTracker'
import {
  initializeGlobalMockState,
  resetAllGlobalMocks,
} from '@/test/isolation/globalStateGuard'
import { globalSpyManager } from '@/test/isolation/spyManager'
import { server } from './mocks/server'

// Extend bun:test expect with jest-dom matchers
expect.extend(matchers)

// Polyfill crypto if missing (use Object.defineProperty for safer global mutation)
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true,
  })
}

const envTracker = createAutoEnvTracker()

// Initialize global state once at setup load time
initializeGlobalMockState()

beforeAll(() => {
  // MSW WARN mode - logs unhandled requests but doesn't fail
  // Frontend tests may have various external calls we don't want to break on
  server.listen({ onUnhandledRequest: 'warn' })
})

beforeEach(() => {
  // Capture environment state at test start
  envTracker.startTracking()
})

afterEach(() => {
  // Reset MSW handlers
  server.resetHandlers()

  // Cleanup React testing-library (unmount components, clear DOM)
  cleanup()

  // Clear the document body for a clean slate
  if (typeof document !== 'undefined' && document.body) {
    document.body.innerHTML = ''
  }

  // Auto-restore all tracked spies (does not affect mock.module)
  globalSpyManager.restoreAll()

  // Auto-restore all environment variable changes
  envTracker.restoreAll()

  // Reset all global mock state (__mockedAuthSession, __mock*, etc.)
  resetAllGlobalMocks()
})

afterAll(() => {
  server.close()
})
