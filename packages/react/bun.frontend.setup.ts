/**
 * Frontend Test Setup for @flowglad/react
 *
 * This setup file is for React component and hook tests that need DOM APIs.
 * It uses happy-dom (fast DOM implementation) instead of jsdom.
 *
 * IMPORTANT: This file must be loaded AFTER bun.dom.preload.ts which sets up
 * the DOM globals. The test runner uses both preloads in order:
 *   --preload ./bun.dom.preload.ts --preload ./bun.frontend.setup.ts
 *
 * Features:
 * - happy-dom global registration (via bun.dom.preload.ts)
 * - jest-dom matchers extended on expect
 * - React Testing Library cleanup after each test
 */

/// <reference lib="dom" />
/// <reference types="@testing-library/jest-dom" />

import { afterEach, expect } from 'bun:test'
import * as matchers from '@testing-library/jest-dom/matchers'
import { cleanup } from '@testing-library/react'

// Extend bun:test expect with jest-dom matchers
expect.extend(matchers)

afterEach(() => {
  // Cleanup React testing-library (unmount components, clear DOM)
  cleanup()

  // Clear the document body for a clean slate
  if (typeof document !== 'undefined' && document.body) {
    document.body.innerHTML = ''
  }
})
