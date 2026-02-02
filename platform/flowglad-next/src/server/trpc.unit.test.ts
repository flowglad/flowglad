/**
 * Unit tests for TRPC procedures (Patch 7).
 *
 * These tests verify that:
 * 1. customerSessionProcedure requires customer session scope
 * 2. customerSessionProcedure rejects API keys
 * 3. customerSessionProcedure requires organizationId from session context
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
})
