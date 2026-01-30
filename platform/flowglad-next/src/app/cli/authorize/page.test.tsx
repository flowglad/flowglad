/**
 * @vitest-environment jsdom
 */
import { describe, it } from 'bun:test'

describe('authorize page', () => {
  it.skip('shows authorization form for valid user code', () => {
    // PENDING: Patch 8
  })

  it.skip('redirects to login if user not authenticated', () => {
    // PENDING: Patch 8
  })

  it.skip('shows error for invalid user code', () => {
    // PENDING: Patch 8
  })

  it.skip('shows error for expired user code', () => {
    // PENDING: Patch 8
  })
})
