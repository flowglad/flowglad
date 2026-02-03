/**
 * @vitest-environment jsdom
 *
 * Unit tests for dual-scope auth client configuration (Patch 2).
 *
 * These tests verify:
 * 1. Auth clients are properly exported
 * 2. Backward compatibility exports work
 * 3. Both merchant and customer auth clients are independent
 *
 * Note: The jsdom environment is required because auth clients use React hooks
 * (useSession) which require a DOM environment.
 */
import { describe, expect, it } from 'bun:test'
import {
  customerAuthClient,
  customerSignIn,
  customerSignOut,
  useCustomerSession,
} from './customerAuthClient'
import {
  authClient,
  customerAuthClient as indexCustomerClient,
  customerSignIn as indexCustomerSignIn,
  customerSignOut as indexCustomerSignOut,
  merchantAuthClient as indexMerchantClient,
  merchantSignIn as indexMerchantSignIn,
  merchantSignOut as indexMerchantSignOut,
  merchantSignUp as indexMerchantSignUp,
  useCustomerSession as indexUseCustomerSession,
  useMerchantSession as indexUseMerchantSession,
  signIn,
  signOut,
  signUp,
  useSession,
} from './index'
import {
  merchantAuthClient,
  merchantSignIn,
  merchantSignOut,
  merchantSignUp,
  useMerchantSession,
} from './merchantAuthClient'

describe('auth client exports', () => {
  it('exports merchantAuthClient as a function', () => {
    expect(typeof merchantAuthClient).toBe('function')
  })

  it('exports customerAuthClient as a function', () => {
    expect(typeof customerAuthClient).toBe('function')
  })

  it('exports merchant sign-in/sign-out/sign-up as functions', () => {
    expect(typeof merchantSignIn).toBe('function')
    expect(typeof merchantSignOut).toBe('function')
    expect(typeof merchantSignUp).toBe('function')
  })

  it('exports customer sign-in/sign-out as functions', () => {
    expect(typeof customerSignIn).toBe('function')
    expect(typeof customerSignOut).toBe('function')
  })

  it('exports useMerchantSession hook as a function', () => {
    expect(typeof useMerchantSession).toBe('function')
  })

  it('exports useCustomerSession hook as a function', () => {
    expect(typeof useCustomerSession).toBe('function')
  })
})

describe('auth client index backward compatibility exports', () => {
  it('exports authClient as alias for merchantAuthClient', () => {
    expect(authClient).toBe(merchantAuthClient)
  })

  it('exports signIn as alias for merchantSignIn', () => {
    expect(signIn).toBe(merchantSignIn)
  })

  it('exports signOut as alias for merchantSignOut', () => {
    expect(signOut).toBe(merchantSignOut)
  })

  it('exports signUp as alias for merchantSignUp', () => {
    expect(signUp).toBe(merchantSignUp)
  })

  it('exports useSession as alias for useMerchantSession', () => {
    expect(useSession).toBe(useMerchantSession)
  })
})

describe('auth client index re-exports', () => {
  it('re-exports both auth clients from index as distinct functions', () => {
    expect(indexMerchantClient).toBe(merchantAuthClient)
    expect(indexCustomerClient).toBe(customerAuthClient)
    expect(indexMerchantClient).not.toBe(indexCustomerClient)
  })

  it('re-exports all merchant functions from index', () => {
    expect(indexMerchantSignIn).toBe(merchantSignIn)
    expect(indexMerchantSignOut).toBe(merchantSignOut)
    expect(indexMerchantSignUp).toBe(merchantSignUp)
    expect(indexUseMerchantSession).toBe(useMerchantSession)
  })

  it('re-exports all customer functions from index', () => {
    expect(indexCustomerSignIn).toBe(customerSignIn)
    expect(indexCustomerSignOut).toBe(customerSignOut)
    expect(indexUseCustomerSession).toBe(useCustomerSession)
  })
})

describe('auth client independence', () => {
  it('merchantAuthClient and customerAuthClient are separate functions', () => {
    expect(merchantAuthClient).not.toBe(customerAuthClient)
  })

  it('session hooks are distinct between merchant and customer', () => {
    expect(useMerchantSession).not.toBe(useCustomerSession)
  })

  it('sign-out functions are distinct between merchant and customer', () => {
    expect(merchantSignOut).not.toBe(customerSignOut)
  })
})
