import { FlowgladActionKey } from '@flowglad/shared'
import { describe, expect, it } from 'vitest'
import {
  type BetterAuthSessionResult,
  endpointKeyToActionKey,
  type FlowgladBetterAuthPluginOptions,
  flowgladPlugin,
  resolveCustomerExternalId,
} from './better-auth'

describe('resolveCustomerExternalId', () => {
  const baseSession: BetterAuthSessionResult = {
    session: {
      id: 'session-123',
      userId: 'user-456',
    },
    user: {
      id: 'user-456',
      name: 'Test User',
      email: 'test@example.com',
    },
  }

  const sessionWithOrg: BetterAuthSessionResult = {
    session: {
      id: 'session-123',
      userId: 'user-456',
      activeOrganizationId: 'org-789',
    },
    user: {
      id: 'user-456',
      name: 'Test User',
      email: 'test@example.com',
    },
  }

  describe('user customer type', () => {
    it('returns the user ID as externalId when customerType is undefined (defaults to user)', () => {
      const options: FlowgladBetterAuthPluginOptions = {}
      const result = resolveCustomerExternalId(options, baseSession)

      expect(result).toEqual({ externalId: 'user-456' })
      expect('error' in result).toBe(false)
    })

    it('returns the user ID as externalId when customerType is explicitly "user"', () => {
      const options: FlowgladBetterAuthPluginOptions = {
        customerType: 'user',
      }
      const result = resolveCustomerExternalId(options, baseSession)

      expect(result).toEqual({ externalId: 'user-456' })
      expect('error' in result).toBe(false)
    })

    it('returns user ID even when session has an active organization (customerType is user)', () => {
      const options: FlowgladBetterAuthPluginOptions = {
        customerType: 'user',
      }
      const result = resolveCustomerExternalId(
        options,
        sessionWithOrg
      )

      expect(result).toEqual({ externalId: 'user-456' })
      expect('error' in result).toBe(false)
    })
  })

  describe('organization customer type', () => {
    it('returns the organization ID as externalId when customerType is "organization" and session has activeOrganizationId', () => {
      const options: FlowgladBetterAuthPluginOptions = {
        customerType: 'organization',
      }
      const result = resolveCustomerExternalId(
        options,
        sessionWithOrg
      )

      expect(result).toEqual({ externalId: 'org-789' })
      expect('error' in result).toBe(false)
    })

    it('returns NO_ACTIVE_ORGANIZATION error when customerType is "organization" but session lacks activeOrganizationId', () => {
      const options: FlowgladBetterAuthPluginOptions = {
        customerType: 'organization',
      }
      const result = resolveCustomerExternalId(options, baseSession)

      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error.code).toBe('NO_ACTIVE_ORGANIZATION')
        expect(result.error.message).toContain(
          'Organization billing requires an active organization'
        )
      }
    })
  })
})

describe('endpointKeyToActionKey', () => {
  it('maps all 11 FlowgladActionKey values to endpoint keys', () => {
    const expectedMappings: Record<string, FlowgladActionKey> = {
      getCustomerBilling: FlowgladActionKey.GetCustomerBilling,
      findOrCreateCustomer: FlowgladActionKey.FindOrCreateCustomer,
      createCheckoutSession: FlowgladActionKey.CreateCheckoutSession,
      createAddPaymentMethodCheckoutSession:
        FlowgladActionKey.CreateAddPaymentMethodCheckoutSession,
      createActivateSubscriptionCheckoutSession:
        FlowgladActionKey.CreateActivateSubscriptionCheckoutSession,
      cancelSubscription: FlowgladActionKey.CancelSubscription,
      uncancelSubscription: FlowgladActionKey.UncancelSubscription,
      adjustSubscription: FlowgladActionKey.AdjustSubscription,
      createSubscription: FlowgladActionKey.CreateSubscription,
      updateCustomer: FlowgladActionKey.UpdateCustomer,
      createUsageEvent: FlowgladActionKey.CreateUsageEvent,
    }

    expect(endpointKeyToActionKey).toEqual(expectedMappings)
    expect(Object.keys(endpointKeyToActionKey)).toHaveLength(11)
  })
})

describe('flowgladPlugin', () => {
  it('returns a plugin with id "flowglad" and all required endpoints', () => {
    const plugin = flowgladPlugin({})

    expect(plugin.id).toBe('flowglad')

    // Verify all 11 billing endpoints exist plus the getExternalId utility endpoint
    const expectedEndpoints = [
      'getExternalId',
      'getCustomerBilling',
      'findOrCreateCustomer',
      'createCheckoutSession',
      'createAddPaymentMethodCheckoutSession',
      'createActivateSubscriptionCheckoutSession',
      'cancelSubscription',
      'uncancelSubscription',
      'adjustSubscription',
      'createSubscription',
      'updateCustomer',
      'createUsageEvent',
    ]

    for (const endpoint of expectedEndpoints) {
      expect(plugin.endpoints).toHaveProperty(endpoint)
    }
    expect(Object.keys(plugin.endpoints)).toHaveLength(12)
  })

  it('includes after hooks for sign-up and organization creation', () => {
    const plugin = flowgladPlugin({})

    expect(Array.isArray(plugin.hooks.after)).toBe(true)
    expect(plugin.hooks.after).toHaveLength(2)

    // Verify matchers exist and work correctly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchers = plugin.hooks.after.map(
      (hook) => hook.matcher
    ) as ((ctx: { path: string }) => boolean)[]
    expect(matchers[0]({ path: '/sign-up' })).toBe(true)
    expect(matchers[0]({ path: '/sign-up/email' })).toBe(true)
    expect(matchers[0]({ path: '/login' })).toBe(false)
    expect(matchers[1]({ path: '/organization/create' })).toBe(true)
    expect(matchers[1]({ path: '/organization/list' })).toBe(false)
  })
})
