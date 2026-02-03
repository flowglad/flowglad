/**
 * Unit tests for split logout mutations (Patch 6).
 *
 * These tests verify that:
 * 1. logoutMerchant calls merchantAuth.api.signOut
 * 2. logoutCustomer calls customerAuth.api.signOut and clears billing portal context
 * 3. Legacy logout mutation maintains backward compatibility
 * 4. All logout mutations are public procedures (no auth required)
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
import { appRouter } from '@/server/index'
import { createSpyTracker } from '@/test/spyTracker'
import * as customerAuthModule from '@/utils/auth/customerAuth'
import * as merchantAuthModule from '@/utils/auth/merchantAuth'
import * as customerBillingPortalState from '@/utils/customerBillingPortalState'

const spyTracker = createSpyTracker()

describe('logout mutations (Patch 6)', () => {
  beforeEach(() => {
    spyTracker.reset()
  })

  afterEach(() => {
    spyTracker.restoreAll()
  })

  describe('logoutMerchant', () => {
    it('is a public procedure that can be called without authentication', async () => {
      // Create an unauthenticated context (no user, no session)
      const ctx = {
        user: undefined,
        session: undefined,
        organizationId: undefined,
        organization: undefined,
        environment: 'live' as const,
        livemode: true,
        path: '/test',
        isApi: false,
        apiKey: undefined,
        authScope: 'merchant' as const,
      }

      // Spy on merchantAuth.api.signOut
      const signOutSpy = spyOn(
        merchantAuthModule.merchantAuth.api,
        'signOut'
      ).mockResolvedValue(undefined as never)
      spyTracker.track(signOutSpy)

      // Call logoutMerchant - should not throw even without auth
      const result = await appRouter
        .createCaller(ctx)
        .utils.logoutMerchant()

      expect(result.success).toBe(true)
      expect(signOutSpy).toHaveBeenCalled()
    })

    it('calls merchantAuth.api.signOut with headers', async () => {
      const ctx = {
        user: undefined,
        session: undefined,
        organizationId: undefined,
        organization: undefined,
        environment: 'live' as const,
        livemode: true,
        path: '/test',
        isApi: false,
        apiKey: undefined,
        authScope: 'merchant' as const,
      }

      const signOutSpy = spyOn(
        merchantAuthModule.merchantAuth.api,
        'signOut'
      ).mockResolvedValue(undefined as never)
      spyTracker.track(signOutSpy)

      await appRouter.createCaller(ctx).utils.logoutMerchant()

      expect(signOutSpy).toHaveBeenCalledTimes(1)
      // Verify it was called with headers parameter
      const callArgs = signOutSpy.mock.calls[0][0]
      expect(callArgs).toHaveProperty('headers')
    })

    it('does not call customerAuth.api.signOut', async () => {
      const ctx = {
        user: undefined,
        session: undefined,
        organizationId: undefined,
        organization: undefined,
        environment: 'live' as const,
        livemode: true,
        path: '/test',
        isApi: false,
        apiKey: undefined,
        authScope: 'merchant' as const,
      }

      const merchantSignOutSpy = spyOn(
        merchantAuthModule.merchantAuth.api,
        'signOut'
      ).mockResolvedValue(undefined as never)
      spyTracker.track(merchantSignOutSpy)

      const customerSignOutSpy = spyOn(
        customerAuthModule.customerAuth.api,
        'signOut'
      ).mockResolvedValue(undefined as never)
      spyTracker.track(customerSignOutSpy)

      await appRouter.createCaller(ctx).utils.logoutMerchant()

      expect(merchantSignOutSpy).toHaveBeenCalled()
      expect(customerSignOutSpy).not.toHaveBeenCalled()
    })
  })

  describe('logoutCustomer', () => {
    it('is a public procedure that can be called without authentication', async () => {
      const ctx = {
        user: undefined,
        session: undefined,
        organizationId: undefined,
        organization: undefined,
        environment: 'live' as const,
        livemode: true,
        path: '/test',
        isApi: false,
        apiKey: undefined,
        authScope: 'customer' as const,
      }

      const signOutSpy = spyOn(
        customerAuthModule.customerAuth.api,
        'signOut'
      ).mockResolvedValue(undefined as never)
      spyTracker.track(signOutSpy)

      const clearBillingPortalSpy = spyOn(
        customerBillingPortalState,
        'clearCustomerBillingPortalOrganizationId'
      ).mockResolvedValue(undefined)
      spyTracker.track(clearBillingPortalSpy)

      // Call logoutCustomer - should not throw even without auth
      const result = await appRouter
        .createCaller(ctx)
        .utils.logoutCustomer()

      expect(result.success).toBe(true)
    })

    it('calls customerAuth.api.signOut with headers', async () => {
      const ctx = {
        user: undefined,
        session: undefined,
        organizationId: undefined,
        organization: undefined,
        environment: 'live' as const,
        livemode: true,
        path: '/test',
        isApi: false,
        apiKey: undefined,
        authScope: 'customer' as const,
      }

      const signOutSpy = spyOn(
        customerAuthModule.customerAuth.api,
        'signOut'
      ).mockResolvedValue(undefined as never)
      spyTracker.track(signOutSpy)

      const clearBillingPortalSpy = spyOn(
        customerBillingPortalState,
        'clearCustomerBillingPortalOrganizationId'
      ).mockResolvedValue(undefined)
      spyTracker.track(clearBillingPortalSpy)

      await appRouter.createCaller(ctx).utils.logoutCustomer()

      expect(signOutSpy).toHaveBeenCalledTimes(1)
      const callArgs = signOutSpy.mock.calls[0][0]
      expect(callArgs).toHaveProperty('headers')
    })

    it('calls clearCustomerBillingPortalOrganizationId', async () => {
      const ctx = {
        user: undefined,
        session: undefined,
        organizationId: undefined,
        organization: undefined,
        environment: 'live' as const,
        livemode: true,
        path: '/test',
        isApi: false,
        apiKey: undefined,
        authScope: 'customer' as const,
      }

      const signOutSpy = spyOn(
        customerAuthModule.customerAuth.api,
        'signOut'
      ).mockResolvedValue(undefined as never)
      spyTracker.track(signOutSpy)

      const clearBillingPortalSpy = spyOn(
        customerBillingPortalState,
        'clearCustomerBillingPortalOrganizationId'
      ).mockResolvedValue(undefined)
      spyTracker.track(clearBillingPortalSpy)

      await appRouter.createCaller(ctx).utils.logoutCustomer()

      expect(clearBillingPortalSpy).toHaveBeenCalledTimes(1)
    })

    it('does not call merchantAuth.api.signOut', async () => {
      const ctx = {
        user: undefined,
        session: undefined,
        organizationId: undefined,
        organization: undefined,
        environment: 'live' as const,
        livemode: true,
        path: '/test',
        isApi: false,
        apiKey: undefined,
        authScope: 'customer' as const,
      }

      const merchantSignOutSpy = spyOn(
        merchantAuthModule.merchantAuth.api,
        'signOut'
      ).mockResolvedValue(undefined as never)
      spyTracker.track(merchantSignOutSpy)

      const customerSignOutSpy = spyOn(
        customerAuthModule.customerAuth.api,
        'signOut'
      ).mockResolvedValue(undefined as never)
      spyTracker.track(customerSignOutSpy)

      const clearBillingPortalSpy = spyOn(
        customerBillingPortalState,
        'clearCustomerBillingPortalOrganizationId'
      ).mockResolvedValue(undefined)
      spyTracker.track(clearBillingPortalSpy)

      await appRouter.createCaller(ctx).utils.logoutCustomer()

      expect(customerSignOutSpy).toHaveBeenCalled()
      expect(merchantSignOutSpy).not.toHaveBeenCalled()
    })
  })

  describe('logout (legacy)', () => {
    it('maintains backward compatibility by calling merchantAuth.api.signOut', async () => {
      const ctx = {
        user: undefined,
        session: undefined,
        organizationId: undefined,
        organization: undefined,
        environment: 'live' as const,
        livemode: true,
        path: '/test',
        isApi: false,
        apiKey: undefined,
        authScope: 'merchant' as const,
      }

      const signOutSpy = spyOn(
        merchantAuthModule.merchantAuth.api,
        'signOut'
      ).mockResolvedValue(undefined as never)
      spyTracker.track(signOutSpy)

      const clearBillingPortalSpy = spyOn(
        customerBillingPortalState,
        'clearCustomerBillingPortalOrganizationId'
      ).mockResolvedValue(undefined)
      spyTracker.track(clearBillingPortalSpy)

      const result = await appRouter.createCaller(ctx).utils.logout()

      expect(result.success).toBe(true)
      expect(signOutSpy).toHaveBeenCalled()
    })

    it('clears customer billing portal organization id for backward compatibility', async () => {
      const ctx = {
        user: undefined,
        session: undefined,
        organizationId: undefined,
        organization: undefined,
        environment: 'live' as const,
        livemode: true,
        path: '/test',
        isApi: false,
        apiKey: undefined,
        authScope: 'merchant' as const,
      }

      const signOutSpy = spyOn(
        merchantAuthModule.merchantAuth.api,
        'signOut'
      ).mockResolvedValue(undefined as never)
      spyTracker.track(signOutSpy)

      const clearBillingPortalSpy = spyOn(
        customerBillingPortalState,
        'clearCustomerBillingPortalOrganizationId'
      ).mockResolvedValue(undefined)
      spyTracker.track(clearBillingPortalSpy)

      await appRouter.createCaller(ctx).utils.logout()

      expect(clearBillingPortalSpy).toHaveBeenCalled()
    })
  })
})
