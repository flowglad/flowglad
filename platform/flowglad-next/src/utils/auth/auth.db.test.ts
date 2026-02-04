/**
 * Unit tests for dual-scope auth configuration (Patch 2).
 *
 * These tests verify:
 * 1. Auth constants are correctly defined
 * 2. Backward compatibility exports work
 * 3. Auth instances and session helpers are properly exported
 *
 * Note: Tests for actual cookie prefix behavior and session scope creation
 * require integration tests with HTTP requests (see Patch 8 tests).
 */
import { describe, expect, it } from 'bun:test'
import {
  CUSTOMER_AUTH_BASE_PATH,
  CUSTOMER_COOKIE_PREFIX,
  MERCHANT_AUTH_BASE_PATH,
  MERCHANT_COOKIE_PREFIX,
} from './constants'
import { customerAuth, getCustomerSession } from './customerAuth'
import {
  auth,
  getSession,
  customerAuth as indexCustomerAuth,
  getCustomerSession as indexGetCustomerSession,
  getMerchantSession as indexGetMerchantSession,
  merchantAuth as indexMerchantAuth,
} from './index'
import { getMerchantSession, merchantAuth } from './merchantAuth'

describe('auth constants', () => {
  it('defines distinct cookie prefixes for merchant and customer that do not collide', () => {
    expect(MERCHANT_COOKIE_PREFIX).toBe('merchant')
    expect(CUSTOMER_COOKIE_PREFIX).toBe('customer')
    expect(MERCHANT_COOKIE_PREFIX).not.toBe(CUSTOMER_COOKIE_PREFIX)
  })

  it('defines distinct base paths for merchant and customer API routes', () => {
    expect(MERCHANT_AUTH_BASE_PATH).toBe('/api/auth/merchant')
    expect(CUSTOMER_AUTH_BASE_PATH).toBe('/api/auth/customer')
    expect(MERCHANT_AUTH_BASE_PATH).not.toBe(CUSTOMER_AUTH_BASE_PATH)
  })

  it('base paths follow the expected URL structure for Next.js API routes', () => {
    expect(MERCHANT_AUTH_BASE_PATH).toMatch(/^\/api\/auth\//)
    expect(CUSTOMER_AUTH_BASE_PATH).toMatch(/^\/api\/auth\//)
  })
})

describe('auth module exports', () => {
  it('exports merchantAuth instance with api object containing getSession', () => {
    expect(typeof merchantAuth.api).toBe('object')
    expect(typeof merchantAuth.api.getSession).toBe('function')
  })

  it('exports customerAuth instance with api object containing getSession', () => {
    expect(typeof customerAuth.api).toBe('object')
    expect(typeof customerAuth.api.getSession).toBe('function')
  })

  it('exports getMerchantSession as a function', () => {
    expect(typeof getMerchantSession).toBe('function')
  })

  it('exports getCustomerSession as a function', () => {
    expect(typeof getCustomerSession).toBe('function')
  })
})

describe('auth index backward compatibility exports', () => {
  it('exports auth as alias for merchantAuth', () => {
    expect(auth).toBe(merchantAuth)
  })

  it('exports getSession as alias for getMerchantSession', () => {
    expect(getSession).toBe(getMerchantSession)
  })

  it('re-exports both auth instances from index as the same objects', () => {
    expect(indexMerchantAuth).toBe(merchantAuth)
    expect(indexCustomerAuth).toBe(customerAuth)
    expect(indexMerchantAuth).not.toBe(indexCustomerAuth)
  })

  it('re-exports both session helpers from index as distinct functions', () => {
    expect(typeof indexGetMerchantSession).toBe('function')
    expect(typeof indexGetCustomerSession).toBe('function')
    expect(indexGetMerchantSession).not.toBe(indexGetCustomerSession)
  })
})

describe('auth instance independence', () => {
  it('merchantAuth and customerAuth are separate instances', () => {
    expect(merchantAuth).not.toBe(customerAuth)
    expect(merchantAuth.api).not.toBe(customerAuth.api)
  })

  it('both auth instances have independent API objects with distinct getSession functions', () => {
    expect(typeof merchantAuth.api.getSession).toBe('function')
    expect(typeof customerAuth.api.getSession).toBe('function')
    expect(merchantAuth.api.getSession).not.toBe(
      customerAuth.api.getSession
    )
  })
})
