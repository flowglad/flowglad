/**
 * @vitest-environment jsdom
 */

/**
 * Device Redirect Page Tests
 *
 * Tests for the /device page that redirects to /cli/authorize
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test'

// Mock next/navigation
const mockRedirect = mock()
mock.module('next/navigation', () => ({
  redirect: mockRedirect,
}))

import DevicePage from './page'

describe('device redirect', () => {
  beforeEach(() => {
    mockRedirect.mockClear()
  })

  it('redirects from /device to /cli/authorize with user_code', async () => {
    const searchParams = Promise.resolve({ user_code: 'ABCD-1234' })

    await DevicePage({ searchParams })

    expect(mockRedirect).toHaveBeenCalledWith(
      '/cli/authorize?user_code=ABCD-1234'
    )
  })

  it('redirects from /device to /cli/authorize without user_code when not provided', async () => {
    const searchParams = Promise.resolve({})

    await DevicePage({ searchParams })

    expect(mockRedirect).toHaveBeenCalledWith('/cli/authorize')
  })

  it('properly encodes special characters in user_code', async () => {
    const searchParams = Promise.resolve({ user_code: 'AB CD+1234' })

    await DevicePage({ searchParams })

    expect(mockRedirect).toHaveBeenCalledWith(
      '/cli/authorize?user_code=AB%20CD%2B1234'
    )
  })
})
