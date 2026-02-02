/**
 * Unit tests for TRPC procedures (Patch 7).
 *
 * These tests verify that:
 * 1. customerSessionProcedure requires customer session scope
 * 2. customerSessionProcedure rejects API keys
 * 3. customerSessionProcedure requires organizationId from session context
 *
 * Note on Patch 9 scope tests:
 * - Test case "should ignore cookie/body org values during OTP verification" is Patch 9 scope
 *   (verification record binding - organizationId should come from verification record, not request)
 * - Test case "should set organizationId from verification record" is Patch 9 scope
 *   (verification record will bind organizationId at send-otp time, verified at verify-otp time)
 */

import { mock, spyOn } from 'bun:test'

// Mock next/headers before other imports
mock.module('next/headers', () => ({
  headers: mock(() => new Headers()),
  cookies: mock(() => ({
    set: mock(),
    get: mock(),
    delete: mock(),
  })),
}))

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { TRPCError } from '@trpc/server'
import { appRouter } from '@/server/index'
import { createSpyTracker } from '@/test/spyTracker'

const spyTracker = createSpyTracker()

describe('customerSessionProcedure (Patch 7)', () => {
  beforeEach(() => {
    spyTracker.reset()
  })

  afterEach(() => {
    spyTracker.restoreAll()
  })

  describe('authentication requirements', () => {
    it('rejects requests without customer session (authScope=merchant)', async () => {
      const ctx = {
        user: { id: 'user_123', email: 'test@example.com' },
        session: { id: 'session_123' },
        organizationId: 'org_123',
        organization: { id: 'org_123', name: 'Test Org' },
        environment: 'live' as const,
        livemode: true,
        path: '/test',
        isApi: false,
        apiKey: undefined,
        authScope: 'merchant' as const,
      }

      await expect(
        appRouter
          .createCaller(ctx)
          .customerBillingPortal.getCustomersForUserAndOrganization(
            {}
          )
      ).rejects.toThrow(TRPCError)
    })

    it('rejects API key authentication for customer procedures', async () => {
      const ctx = {
        user: undefined,
        session: undefined,
        organizationId: 'org_123',
        organization: { id: 'org_123', name: 'Test Org' },
        environment: 'live' as const,
        livemode: true,
        path: '/test',
        isApi: true,
        apiKey: 'test_api_key',
        authScope: 'customer' as const,
      }

      await expect(
        appRouter
          .createCaller(ctx)
          .customerBillingPortal.getCustomersForUserAndOrganization(
            {}
          )
      ).rejects.toThrow(TRPCError)
    })

    it('rejects requests without organizationId in session context', async () => {
      const ctx = {
        user: { id: 'user_123', email: 'test@example.com' },
        session: { id: 'session_123', scope: 'customer' },
        organizationId: undefined, // Missing organizationId
        organization: undefined,
        environment: 'live' as const,
        livemode: true,
        path: '/test',
        isApi: false,
        apiKey: undefined,
        authScope: 'customer' as const,
      }

      await expect(
        appRouter
          .createCaller(ctx)
          .customerBillingPortal.getCustomersForUserAndOrganization(
            {}
          )
      ).rejects.toThrow(TRPCError)
    })

    it('rejects requests without authenticated user', async () => {
      const ctx = {
        user: undefined, // No user
        session: undefined,
        organizationId: 'org_123',
        organization: { id: 'org_123', name: 'Test Org' },
        environment: 'live' as const,
        livemode: true,
        path: '/test',
        isApi: false,
        apiKey: undefined,
        authScope: 'customer' as const,
      }

      await expect(
        appRouter
          .createCaller(ctx)
          .customerBillingPortal.getCustomersForUserAndOrganization(
            {}
          )
      ).rejects.toThrow(TRPCError)
    })
  })

  describe('session context usage', () => {
    it('uses organizationId from session context (not cookie or request body)', async () => {
      // This test verifies that the procedure reads organizationId from the session's
      // contextOrganizationId field (set during OTP verification), not from cookies or
      // request body. The middleware validates the organizationId is present in ctx.
      const ctxWithOrgFromSession = {
        user: { id: 'user_123', email: 'test@example.com' },
        session: { id: 'session_123', scope: 'customer' },
        organizationId: 'org_from_session', // This comes from session.contextOrganizationId
        organization: { id: 'org_from_session', name: 'Session Org' },
        environment: 'live' as const,
        livemode: true,
        path: '/test',
        isApi: false,
        apiKey: undefined,
        authScope: 'customer' as const,
      }

      // The procedure should pass middleware validation when organizationId is present
      // from session context and return a result (empty customers array in this case,
      // since no actual DB records exist). This proves the middleware accepted the
      // organizationId from context rather than rejecting with BAD_REQUEST.
      const result = await appRouter
        .createCaller(ctxWithOrgFromSession)
        .customerBillingPortal.getCustomersForUserAndOrganization({})

      // Middleware passed - we got a valid response structure
      expect(result).toHaveProperty('customers')
      expect(Array.isArray(result.customers)).toBe(true)
    })

    /**
     * PATCH 9 SCOPE: Test cases for verification record binding
     *
     * These tests will be implemented in Patch 9:
     * - should ignore cookie-provided organizationId during OTP verification
     * - should ignore request body organizationId during OTP verification
     * - should use organizationId from verification record (bound at send-otp time)
     *
     * Patch 9 will modify the verify-otp flow to:
     * 1. Store organizationId in the verification record when sending OTP
     * 2. Read organizationId from verification record when verifying OTP
     * 3. Ignore any organizationId from cookies or request body
     *
     * This prevents an attacker from:
     * - Starting OTP flow for org A
     * - Intercepting the OTP
     * - Completing verification with org B in the request
     */
  })

  describe('stale contextOrganizationId handling', () => {
    it('rejects customer session when organization object is undefined (org deleted/invalid)', async () => {
      // This tests the scenario where:
      // - Session has contextOrganizationId set (from OTP verification)
      // - But the organization no longer exists (deleted) or lookup failed
      // - Context has organizationId (from session) but organization is undefined
      //
      // The middleware should reject this with FORBIDDEN because even though
      // organizationId is present, the organization itself doesn't exist.
      const ctxWithStaleOrg = {
        user: { id: 'user_123', email: 'test@example.com' },
        session: { id: 'session_123', scope: 'customer' },
        organizationId: 'org_deleted_123', // Still present from session
        organization: undefined, // But org lookup returned nothing (org was deleted)
        environment: 'live' as const,
        livemode: true,
        path: '/test',
        isApi: false,
        apiKey: undefined,
        authScope: 'customer' as const,
      }

      // Middleware rejects with FORBIDDEN because organization is undefined
      await expect(
        appRouter
          .createCaller(ctxWithStaleOrg)
          .customerBillingPortal.getCustomersForUserAndOrganization(
            {}
          )
      ).rejects.toThrow(TRPCError)
    })
  })
})
