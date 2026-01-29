/**
 * Dual-Scope Auth Sessions Integration Tests
 *
 * These tests verify that merchant and customer sessions can coexist independently,
 * with proper isolation and scoped sign-out behavior.
 *
 * Requirements:
 * - Cookie prefixes are asserted by parsing Set-Cookie headers (not hardcoded)
 * - Session token uniqueness is verified across scopes
 * - Both sessions can exist simultaneously without collision
 * - Sign-out is scope-specific (clearing one doesn't affect the other)
 * - Route protection prevents cross-scope access
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { User } from '@db-core/schema/users'
import { setupCustomer, setupOrg, setupUserAndApiKey } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import core from '@/utils/core'
import { strictLifecycle } from '@/test/setupCommon'

// Import dual auth instances (these will be available after patches 1-7 are complete)
// For now, these imports are commented out as the implementation is pending
// import { getMerchantSession, merchantAuth } from '@/utils/auth/merchantAuth'
// import { getCustomerSession, customerAuth } from '@/utils/auth/customerAuth'
// import { MERCHANT_COOKIE_PREFIX, CUSTOMER_COOKIE_PREFIX } from '@/utils/auth/constants'

// Test lifecycle setup
const lifecycle = strictLifecycle
beforeEach(() => lifecycle.beforeEach())

describe('Dual-Scope Auth Sessions', () => {
  let testOrg: Organization.Record
  let merchantUser: User.Record
  let customerUser: User.Record
  let customer: Customer.Record
  let merchantUserEmail: string
  let customerUserEmail: string

  beforeEach(async () => {
    // Setup test organization
    const orgSetup = await setupOrg()
    testOrg = orgSetup.organization

    // Create merchant user with membership
    merchantUserEmail = `merchant+${core.nanoid()}@test.com`
    const merchantSetup = await setupUserAndApiKey({
      organizationId: testOrg.id,
      livemode: true,
      email: merchantUserEmail,
    })
    merchantUser = merchantSetup.user

    // Create customer user
    customerUserEmail = `customer+${core.nanoid()}@test.com`
    customer = await setupCustomer({
      organizationId: testOrg.id,
      email: customerUserEmail,
      livemode: true,
    })

    // Get customer user record
    const customers = await adminTransaction(async ({ transaction }) => {
      const { selectUsers } = await import('@/db/tableMethods/userMethods')
      return selectUsers({ email: customerUserEmail }, transaction)
    })
    customerUser = customers[0]
  })

  describe('Simultaneous Sessions', () => {
    it.todo(
      'should maintain both merchant and customer sessions independently',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Sign in as merchant (via merchantAuth)
        // 2. Sign in as customer (via customerAuth)
        // 3. Verify both sessions exist and are valid
        // 4. Verify getMerchantSession() returns merchant session
        // 5. Verify getCustomerSession() returns customer session
        // 6. Verify session tokens are different
        // 7. Parse Set-Cookie headers to verify cookie prefixes match constants
        //
        // Example structure:
        // const merchantSession = await signInAsMerchant(merchantUserEmail)
        // const customerSession = await signInAsCustomer(customerUserEmail, testOrg.id, customer.id)
        // expect(merchantSession).toBeDefined()
        // expect(customerSession).toBeDefined()
        // expect(merchantSession.token).not.toEqual(customerSession.token)
        // const merchantCookie = parseCookieHeader(merchantResponse.headers.get('Set-Cookie'))
        // const customerCookie = parseCookieHeader(customerResponse.headers.get('Set-Cookie'))
        // expect(merchantCookie.name).toContain(MERCHANT_COOKIE_PREFIX)
        // expect(customerCookie.name).toContain(CUSTOMER_COOKIE_PREFIX)
      }
    )

    it.todo(
      'should allow same email to have merchant and customer sessions',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Use the same email for both merchant and customer
        // 2. Sign in as merchant
        // 3. Sign in as customer (to different org's billing portal)
        // 4. Verify both sessions coexist
        // 5. Verify sessions have different scopes
        //
        // Example structure:
        // const sameEmail = `same+${core.nanoid()}@test.com`
        // const merchantSession = await signInAsMerchant(sameEmail)
        // const customerSession = await signInAsCustomer(sameEmail, testOrg.id, customer.id)
        // expect(merchantSession.session.scope).toBe('merchant')
        // expect(customerSession.session.scope).toBe('customer')
      }
    )

    it.todo('should verify session token uniqueness across scopes', async () => {
      // TODO: Implement after dual-auth is complete
      // This test should:
      // 1. Create multiple merchant and customer sessions
      // 2. Query the session table to verify all tokens are unique
      // 3. Verify session.scope correctly distinguishes merchant from customer
      //
      // Example structure:
      // const merchantSession1 = await signInAsMerchant(merchantUserEmail)
      // const customerSession1 = await signInAsCustomer(customerUserEmail, testOrg.id, customer.id)
      // const merchantSession2 = await signInAsMerchant(`merchant2+${core.nanoid()}@test.com`)
      // const allSessions = await adminTransaction(async ({ transaction }) => {
      //   const { session } = await import('@db-core/schema/betterAuthSchema')
      //   return transaction.select().from(session)
      // })
      // const tokens = allSessions.map(s => s.token)
      // expect(new Set(tokens).size).toBe(tokens.length) // All tokens unique
      // expect(allSessions.find(s => s.token === merchantSession1.token)?.scope).toBe('merchant')
      // expect(allSessions.find(s => s.token === customerSession1.token)?.scope).toBe('customer')
    })

    it.todo(
      'should parse cookie prefixes from Set-Cookie headers without hardcoding',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Sign in as merchant and capture response headers
        // 2. Parse Set-Cookie header to extract cookie name
        // 3. Verify cookie name contains MERCHANT_COOKIE_PREFIX
        // 4. Sign in as customer and capture response headers
        // 5. Parse Set-Cookie header to extract cookie name
        // 6. Verify cookie name contains CUSTOMER_COOKIE_PREFIX
        // 7. NEVER hardcode cookie names like "merchant.session" or "customer.session"
        //
        // Example structure:
        // const merchantResponse = await fetch('/api/auth/merchant/sign-in', {...})
        // const merchantSetCookie = merchantResponse.headers.get('Set-Cookie')
        // const merchantCookieName = parseCookieName(merchantSetCookie)
        // expect(merchantCookieName).toContain(MERCHANT_COOKIE_PREFIX)
        //
        // const customerResponse = await fetch('/api/auth/customer/sign-in', {...})
        // const customerSetCookie = customerResponse.headers.get('Set-Cookie')
        // const customerCookieName = parseCookieName(customerSetCookie)
        // expect(customerCookieName).toContain(CUSTOMER_COOKIE_PREFIX)
      }
    )
  })

  describe('Scoped Sign-Out', () => {
    it.todo(
      'should only clear merchant session on merchant sign-out',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Establish both merchant and customer sessions
        // 2. Call merchant sign-out mutation
        // 3. Verify merchant session is cleared
        // 4. Verify customer session remains valid
        // 5. Parse response headers to verify only merchant cookie is cleared
        //
        // Example structure:
        // await signInAsMerchant(merchantUserEmail)
        // await signInAsCustomer(customerUserEmail, testOrg.id, customer.id)
        // await merchantSignOut()
        // const merchantSession = await getMerchantSession()
        // const customerSession = await getCustomerSession()
        // expect(merchantSession).toBeNull()
        // expect(customerSession).toBeDefined()
      }
    )

    it.todo(
      'should only clear customer session on customer sign-out',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Establish both merchant and customer sessions
        // 2. Call customer sign-out mutation
        // 3. Verify customer session is cleared
        // 4. Verify merchant session remains valid
        // 5. Parse response headers to verify only customer cookie is cleared
        //
        // Example structure:
        // await signInAsMerchant(merchantUserEmail)
        // await signInAsCustomer(customerUserEmail, testOrg.id, customer.id)
        // await customerSignOut()
        // const merchantSession = await getMerchantSession()
        // const customerSession = await getCustomerSession()
        // expect(merchantSession).toBeDefined()
        // expect(customerSession).toBeNull()
      }
    )

    it.todo(
      'should verify cookie headers for scope-specific sign-out',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Sign in with both sessions
        // 2. Sign out from merchant
        // 3. Parse Set-Cookie headers to verify only merchant cookie has Max-Age=0 (deletion)
        // 4. Verify customer cookie is not present in the sign-out response headers
        //
        // Example structure:
        // await signInAsMerchant(merchantUserEmail)
        // await signInAsCustomer(customerUserEmail, testOrg.id, customer.id)
        // const signOutResponse = await fetch('/api/auth/merchant/sign-out', {...})
        // const setCookies = signOutResponse.headers.getSetCookie()
        // const merchantCookie = setCookies.find(c => c.includes(MERCHANT_COOKIE_PREFIX))
        // const customerCookie = setCookies.find(c => c.includes(CUSTOMER_COOKIE_PREFIX))
        // expect(merchantCookie).toContain('Max-Age=0')
        // expect(customerCookie).toBeUndefined()
      }
    )
  })

  describe('Scope Mismatch Errors', () => {
    it.todo(
      'should return 401 when customer tries merchant-only route',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Sign in with only customer session
        // 2. Call merchant protectedProcedure via TRPC
        // 3. Expect 401 UNAUTHORIZED error
        //
        // Example structure:
        // await signInAsCustomer(customerUserEmail, testOrg.id, customer.id)
        // const trpcCaller = createTRPCCaller({ merchantSession: null, customerSession: validSession })
        // await expect(trpcCaller.someMerchantOnlyProcedure()).rejects.toThrow('UNAUTHORIZED')
      }
    )

    it.todo(
      'should return 401 when merchant tries customer-only route',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Sign in with only merchant session
        // 2. Call customerProtectedProcedure via TRPC
        // 3. Expect 401 UNAUTHORIZED error
        //
        // Example structure:
        // await signInAsMerchant(merchantUserEmail)
        // const trpcCaller = createTRPCCaller({ merchantSession: validSession, customerSession: null })
        // await expect(trpcCaller.customerBillingPortal.someCustomerProcedure()).rejects.toThrow('UNAUTHORIZED')
      }
    )

    it.todo(
      'should reject API key access to customer billing portal',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Create a valid merchant API key
        // 2. Attempt to call customerProtectedProcedure with API key
        // 3. Expect 401 UNAUTHORIZED error
        //
        // Example structure:
        // const apiKeySetup = await setupUserAndApiKey({ organizationId: testOrg.id, livemode: true })
        // const trpcCaller = createTRPCCaller({ apiKey: apiKeySetup.apiKey.token })
        // await expect(trpcCaller.customerBillingPortal.someCustomerProcedure()).rejects.toThrow('UNAUTHORIZED')
      }
    )

    it.todo(
      'should verify session scope field is checked by middleware',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Directly manipulate a session's scope field in the database
        // 2. Attempt to access routes with mismatched scope
        // 3. Verify middleware rejects the request
        //
        // Example structure:
        // const session = await signInAsMerchant(merchantUserEmail)
        // await adminTransaction(async ({ transaction }) => {
        //   const { session: sessionTable } = await import('@db-core/schema/betterAuthSchema')
        //   await transaction.update(sessionTable).set({ scope: 'customer' }).where(eq(sessionTable.token, session.token))
        // })
        // // Attempt merchant route with tampered session
        // await expect(merchantProtectedRoute()).rejects.toThrow('UNAUTHORIZED')
      }
    )
  })

  describe('Route Protection', () => {
    it.todo(
      'should allow merchant session to access merchant TRPC routes',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Sign in as merchant
        // 2. Call a merchant-only TRPC procedure
        // 3. Verify it succeeds
        //
        // Example structure:
        // await signInAsMerchant(merchantUserEmail)
        // const result = await merchantProtectedProcedure()
        // expect(result).toBeDefined()
      }
    )

    it.todo(
      'should allow customer session to access customer TRPC routes',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Sign in as customer
        // 2. Call a customer-only TRPC procedure
        // 3. Verify it succeeds
        //
        // Example structure:
        // await signInAsCustomer(customerUserEmail, testOrg.id, customer.id)
        // const result = await customerProtectedProcedure()
        // expect(result).toBeDefined()
      }
    )

    it.todo(
      'should validate customer session contextOrganizationId matches route',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Sign in as customer for org A
        // 2. Attempt to access customer route for org B
        // 3. Expect FORBIDDEN error
        //
        // Example structure:
        // const otherOrg = (await setupOrg()).organization
        // await signInAsCustomer(customerUserEmail, testOrg.id, customer.id)
        // const trpcCaller = createCustomerTRPCCaller()
        // await expect(trpcCaller.customerBillingPortal.procedure({ organizationId: otherOrg.id })).rejects.toThrow('FORBIDDEN')
      }
    )

    it.todo(
      'should reject customer session with missing contextOrganizationId',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Create a customer session
        // 2. Manually clear contextOrganizationId from session
        // 3. Attempt to call customer procedure
        // 4. Expect BAD_REQUEST error
        //
        // Example structure:
        // const session = await signInAsCustomer(customerUserEmail, testOrg.id, customer.id)
        // await adminTransaction(async ({ transaction }) => {
        //   const { session: sessionTable } = await import('@db-core/schema/betterAuthSchema')
        //   await transaction.update(sessionTable).set({ contextOrganizationId: null }).where(eq(sessionTable.token, session.token))
        // })
        // await expect(customerProtectedProcedure()).rejects.toThrow('BAD_REQUEST')
      }
    )
  })

  describe('Session Expiry Independence', () => {
    it.todo(
      'should not affect customer session when merchant session expires',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Establish both sessions
        // 2. Manually expire merchant session
        // 3. Verify customer routes still work
        // 4. Verify merchant routes require re-auth
        //
        // Example structure:
        // await signInAsMerchant(merchantUserEmail)
        // await signInAsCustomer(customerUserEmail, testOrg.id, customer.id)
        // await expireMerchantSession()
        // await expect(merchantProtectedProcedure()).rejects.toThrow('UNAUTHORIZED')
        // const customerResult = await customerProtectedProcedure()
        // expect(customerResult).toBeDefined()
      }
    )

    it.todo(
      'should not affect merchant session when customer session expires',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Establish both sessions
        // 2. Manually expire customer session
        // 3. Verify merchant routes still work
        // 4. Verify customer routes require re-auth
        //
        // Example structure:
        // await signInAsMerchant(merchantUserEmail)
        // await signInAsCustomer(customerUserEmail, testOrg.id, customer.id)
        // await expireCustomerSession()
        // await expect(customerProtectedProcedure()).rejects.toThrow('UNAUTHORIZED')
        // const merchantResult = await merchantProtectedProcedure()
        // expect(merchantResult).toBeDefined()
      }
    )

    it.todo('should verify customer sessions expire after 24 hours', async () => {
      // TODO: Implement after dual-auth is complete
      // This test should:
      // 1. Sign in as customer
      // 2. Query session table to verify expiresAt is ~24 hours from now
      // 3. Verify tolerance (e.g., within 1 minute of expected)
      //
      // Example structure:
      // const session = await signInAsCustomer(customerUserEmail, testOrg.id, customer.id)
      // const sessionRecord = await adminTransaction(async ({ transaction }) => {
      //   const { session: sessionTable } = await import('@db-core/schema/betterAuthSchema')
      //   const [record] = await transaction.select().from(sessionTable).where(eq(sessionTable.token, session.token))
      //   return record
      // })
      // const expectedExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000)
      // const actualExpiry = new Date(sessionRecord.expiresAt)
      // const diff = Math.abs(actualExpiry.getTime() - expectedExpiry.getTime())
      // expect(diff).toBeLessThan(60 * 1000) // Within 1 minute tolerance
    })
  })

  describe('Cookie Prefix Validation', () => {
    it.todo(
      'should verify merchant cookie uses MERCHANT_COOKIE_PREFIX from constants',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Sign in as merchant
        // 2. Parse Set-Cookie header
        // 3. Verify cookie name starts with MERCHANT_COOKIE_PREFIX constant
        // 4. NEVER hardcode expected cookie name
        //
        // Example structure:
        // const response = await fetch('/api/auth/merchant/sign-in', {...})
        // const setCookie = response.headers.get('Set-Cookie')
        // const cookieName = parseCookieName(setCookie)
        // // Import the constant from the shared constants file
        // const { MERCHANT_COOKIE_PREFIX } = await import('@/utils/auth/constants')
        // expect(cookieName).toStartWith(MERCHANT_COOKIE_PREFIX)
      }
    )

    it.todo(
      'should verify customer cookie uses CUSTOMER_COOKIE_PREFIX from constants',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Sign in as customer
        // 2. Parse Set-Cookie header
        // 3. Verify cookie name starts with CUSTOMER_COOKIE_PREFIX constant
        // 4. NEVER hardcode expected cookie name
        //
        // Example structure:
        // const response = await fetch('/api/auth/customer/sign-in', {...})
        // const setCookie = response.headers.get('Set-Cookie')
        // const cookieName = parseCookieName(setCookie)
        // const { CUSTOMER_COOKIE_PREFIX } = await import('@/utils/auth/constants')
        // expect(cookieName).toStartWith(CUSTOMER_COOKIE_PREFIX)
      }
    )

    it.todo(
      'should verify cookie prefixes are distinct and non-overlapping',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Import both cookie prefix constants
        // 2. Verify they are different
        // 3. Verify neither is a prefix of the other
        //
        // Example structure:
        // const { MERCHANT_COOKIE_PREFIX, CUSTOMER_COOKIE_PREFIX } = await import('@/utils/auth/constants')
        // expect(MERCHANT_COOKIE_PREFIX).not.toBe(CUSTOMER_COOKIE_PREFIX)
        // expect(MERCHANT_COOKIE_PREFIX.startsWith(CUSTOMER_COOKIE_PREFIX)).toBe(false)
        // expect(CUSTOMER_COOKIE_PREFIX.startsWith(MERCHANT_COOKIE_PREFIX)).toBe(false)
      }
    )
  })

  describe('Edge Cases', () => {
    it.todo(
      'should handle simultaneous sign-in requests for both scopes',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Initiate merchant sign-in
        // 2. Initiate customer sign-in concurrently
        // 3. Verify both complete successfully
        // 4. Verify both sessions are valid
        //
        // Example structure:
        // const [merchantSession, customerSession] = await Promise.all([
        //   signInAsMerchant(merchantUserEmail),
        //   signInAsCustomer(customerUserEmail, testOrg.id, customer.id),
        // ])
        // expect(merchantSession).toBeDefined()
        // expect(customerSession).toBeDefined()
      }
    )

    it.todo('should handle rapid scope switching', async () => {
      // TODO: Implement after dual-auth is complete
      // This test should:
      // 1. Sign in as merchant
      // 2. Sign in as customer
      // 3. Sign out merchant
      // 4. Sign in as merchant again
      // 5. Verify final state has both valid sessions
      //
      // Example structure:
      // await signInAsMerchant(merchantUserEmail)
      // await signInAsCustomer(customerUserEmail, testOrg.id, customer.id)
      // await merchantSignOut()
      // await signInAsMerchant(merchantUserEmail)
      // const merchantSession = await getMerchantSession()
      // const customerSession = await getCustomerSession()
      // expect(merchantSession).toBeDefined()
      // expect(customerSession).toBeDefined()
    })

    it.todo(
      'should verify session table queries filter by scope correctly',
      async () => {
        // TODO: Implement after dual-auth is complete
        // This test should:
        // 1. Create multiple sessions of both scopes
        // 2. Query for merchant sessions only
        // 3. Verify all returned sessions have scope='merchant'
        // 4. Query for customer sessions only
        // 5. Verify all returned sessions have scope='customer'
        //
        // Example structure:
        // await signInAsMerchant(merchantUserEmail)
        // await signInAsCustomer(customerUserEmail, testOrg.id, customer.id)
        // const merchantSessions = await adminTransaction(async ({ transaction }) => {
        //   const { session } = await import('@db-core/schema/betterAuthSchema')
        //   return transaction.select().from(session).where(eq(session.scope, 'merchant'))
        // })
        // expect(merchantSessions.every(s => s.scope === 'merchant')).toBe(true)
      }
    )
  })
})

// Helper utilities (to be implemented when dual-auth is complete)

/**
 * Parses a Set-Cookie header to extract the cookie name
 * @param setCookieHeader - The Set-Cookie header string
 * @returns The cookie name
 */
function parseCookieName(setCookieHeader: string | null): string {
  if (!setCookieHeader) {
    throw new Error('No Set-Cookie header found')
  }
  const match = setCookieHeader.match(/^([^=]+)=/)
  if (!match) {
    throw new Error('Invalid Set-Cookie header format')
  }
  return match[1]
}

/**
 * Checks if a cookie is being deleted (has Max-Age=0 or Expires in the past)
 * @param setCookieHeader - The Set-Cookie header string
 * @returns True if the cookie is being deleted
 */
function isCookieDeleted(setCookieHeader: string): boolean {
  return (
    setCookieHeader.includes('Max-Age=0') ||
    setCookieHeader.includes('Expires=Thu, 01 Jan 1970')
  )
}
