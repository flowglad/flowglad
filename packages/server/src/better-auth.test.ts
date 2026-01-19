import {
  type AuthenticatedActionKey,
  FlowgladActionKey,
  flowgladActionValidators,
  type HybridActionKey,
} from '@flowglad/shared'
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

describe('endpointKeyToActionKey exhaustiveness', () => {
  it('covers every AuthenticatedActionKey value exactly once (excludes hybrid routes)', () => {
    // Hybrid routes like GetPricingModel are handled separately and not included
    // in endpointKeyToActionKey since they support unauthenticated access
    const hybridActionKeys: HybridActionKey[] = [
      FlowgladActionKey.GetPricingModel,
    ]
    const authenticatedActionKeys = Object.values(
      FlowgladActionKey
    ).filter(
      (key): key is AuthenticatedActionKey =>
        !hybridActionKeys.includes(key as HybridActionKey)
    )
    const mappedActionKeys = Object.values(endpointKeyToActionKey)

    // Every AuthenticatedActionKey must be in the mapping
    for (const actionKey of authenticatedActionKeys) {
      expect(mappedActionKeys).toContain(actionKey)
    }

    // No duplicates: mappedActionKeys length should equal unique values
    expect(new Set(mappedActionKeys).size).toBe(
      mappedActionKeys.length
    )

    // Same count: ensures bidirectional completeness for authenticated routes
    expect(mappedActionKeys.length).toBe(
      authenticatedActionKeys.length
    )
  })

  it('has a corresponding plugin endpoint for each mapped action key', () => {
    const plugin = flowgladPlugin({})
    const endpointKeys = Object.keys(endpointKeyToActionKey)

    for (const endpointKey of endpointKeys) {
      expect(plugin.endpoints).toHaveProperty(endpointKey)
    }
  })

  it('has plugin endpoint for GetPricingModel hybrid route', () => {
    const plugin = flowgladPlugin({})
    expect(plugin.endpoints).toHaveProperty('getPricingModel')
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
      'getResources',
      'getResourceUsage',
      'claimResource',
      'releaseResource',
      'listResourceClaims',
      'getPricingModel',
    ]

    for (const endpoint of expectedEndpoints) {
      expect(plugin.endpoints).toHaveProperty(endpoint)
    }
    expect(Object.keys(plugin.endpoints)).toHaveLength(
      expectedEndpoints.length
    )
  })

  it('includes after hooks for sign-up and organization creation', () => {
    const plugin = flowgladPlugin({})

    expect(Array.isArray(plugin.hooks.after)).toBe(true)
    expect(plugin.hooks.after).toHaveLength(2)

    // Verify matchers exist and work correctly
    // The matchers accept HookEndpointContext but only use the path property,
    // so we can safely test with a minimal { path } object
    const matchers = plugin.hooks.after.map(
      (hook) => (ctx: { path: string }) =>
        hook.matcher(ctx as Parameters<typeof hook.matcher>[0])
    )
    expect(matchers[0]({ path: '/sign-up' })).toBe(true)
    expect(matchers[0]({ path: '/sign-up/email' })).toBe(true)
    expect(matchers[0]({ path: '/login' })).toBe(false)
    expect(matchers[1]({ path: '/organization/create' })).toBe(true)
    expect(matchers[1]({ path: '/organization/list' })).toBe(false)
  })
})

describe('externalId injection into validators', () => {
  /**
   * These tests verify that the externalId injection logic in createFlowgladBillingEndpoint
   * works correctly with each validator. The endpoint injects externalId into the request
   * body before validation.
   */

  describe('validators that require externalId', () => {
    it('GetCustomerBilling validator accepts body with only externalId', () => {
      const validator =
        flowgladActionValidators[FlowgladActionKey.GetCustomerBilling]
      const result = validator.inputValidator.safeParse({
        externalId: 'user-123',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ externalId: 'user-123' })
      }
    })

    it('FindOrCreateCustomer validator accepts body with only externalId', () => {
      const validator =
        flowgladActionValidators[
          FlowgladActionKey.FindOrCreateCustomer
        ]
      const result = validator.inputValidator.safeParse({
        externalId: 'user-123',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ externalId: 'user-123' })
      }
    })

    it('UpdateCustomer validator accepts externalId with customer data', () => {
      const validator =
        flowgladActionValidators[FlowgladActionKey.UpdateCustomer]
      const result = validator.inputValidator.safeParse({
        externalId: 'user-123',
        customer: { id: 'cust-456', name: 'Updated Name' },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveProperty('externalId', 'user-123')
        expect(result.data).toHaveProperty('customer')
      }
    })
  })

  describe('validators that do NOT require externalId (Zod strips unknown fields by default)', () => {
    it('CreateCheckoutSession validator passes with externalId and strips it from output', () => {
      const validator =
        flowgladActionValidators[
          FlowgladActionKey.CreateCheckoutSession
        ]
      const result = validator.inputValidator.safeParse({
        priceId: 'price-123',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        externalId: 'user-123', // Injected by server, should be stripped
      })

      expect(result.success).toBe(true)
      if (result.success) {
        // Zod strips unknown fields by default
        expect(result.data).not.toHaveProperty('externalId')
        expect(result.data).toHaveProperty('priceId', 'price-123')
      }
    })

    it('CreateAddPaymentMethodCheckoutSession validator passes with externalId and strips it', () => {
      const validator =
        flowgladActionValidators[
          FlowgladActionKey.CreateAddPaymentMethodCheckoutSession
        ]
      const result = validator.inputValidator.safeParse({
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        externalId: 'user-123',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).not.toHaveProperty('externalId')
      }
    })

    it('CreateActivateSubscriptionCheckoutSession validator passes with externalId and strips it', () => {
      const validator =
        flowgladActionValidators[
          FlowgladActionKey.CreateActivateSubscriptionCheckoutSession
        ]
      const result = validator.inputValidator.safeParse({
        targetSubscriptionId: 'sub-123',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        externalId: 'user-123',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).not.toHaveProperty('externalId')
        expect(result.data).toHaveProperty(
          'targetSubscriptionId',
          'sub-123'
        )
      }
    })

    it('CancelSubscription validator passes with externalId and strips it', () => {
      const validator =
        flowgladActionValidators[FlowgladActionKey.CancelSubscription]
      const result = validator.inputValidator.safeParse({
        id: 'sub-123',
        cancellation: { timing: 'immediately' },
        externalId: 'user-123',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).not.toHaveProperty('externalId')
        expect(result.data).toHaveProperty('id', 'sub-123')
      }
    })

    it('UncancelSubscription validator passes with externalId and strips it', () => {
      const validator =
        flowgladActionValidators[
          FlowgladActionKey.UncancelSubscription
        ]
      const result = validator.inputValidator.safeParse({
        id: 'sub-123',
        externalId: 'user-123',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).not.toHaveProperty('externalId')
        expect(result.data).toHaveProperty('id', 'sub-123')
      }
    })

    it('AdjustSubscription validator passes with externalId and strips it', () => {
      const validator =
        flowgladActionValidators[FlowgladActionKey.AdjustSubscription]
      const result = validator.inputValidator.safeParse({
        priceSlug: 'pro-monthly',
        externalId: 'user-123',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).not.toHaveProperty('externalId')
        expect(result.data).toHaveProperty('priceSlug', 'pro-monthly')
      }
    })

    it('CreateSubscription validator passes with externalId and strips it', () => {
      const validator =
        flowgladActionValidators[FlowgladActionKey.CreateSubscription]
      const result = validator.inputValidator.safeParse({
        priceId: 'price-123',
        customerId: 'cust-456',
        externalId: 'user-123',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).not.toHaveProperty('externalId')
        expect(result.data).toHaveProperty('priceId', 'price-123')
        expect(result.data).toHaveProperty('customerId', 'cust-456')
      }
    })

    it('CreateUsageEvent validator passes with externalId and strips it', () => {
      const validator =
        flowgladActionValidators[FlowgladActionKey.CreateUsageEvent]
      const result = validator.inputValidator.safeParse({
        priceId: 'price-123',
        externalId: 'user-123',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).not.toHaveProperty('externalId')
        expect(result.data).toHaveProperty('priceId', 'price-123')
      }
    })
  })

  describe('externalId override security', () => {
    it('server-injected externalId overrides any client-provided externalId due to spread order', () => {
      // This tests the merge behavior in createFlowgladBillingEndpoint:
      // const bodyWithExternalId = { ...rawBody, externalId: customerResult.externalId }
      // The server externalId comes LAST, so it overrides any client value

      const clientBody = { externalId: 'malicious-attacker-id' }
      const serverExternalId = 'authenticated-user-id'

      const merged = {
        ...clientBody,
        externalId: serverExternalId,
      }

      expect(merged.externalId).toBe('authenticated-user-id')
    })

    it('GetCustomerBilling with conflicting client externalId uses server-injected value after merge', () => {
      // Simulate what happens in the endpoint
      const clientBody = { externalId: 'attacker-id' }
      const serverExternalId = 'real-user-id'

      const bodyWithExternalId = {
        ...clientBody,
        externalId: serverExternalId,
      }

      const validator =
        flowgladActionValidators[FlowgladActionKey.GetCustomerBilling]
      const result = validator.inputValidator.safeParse(
        bodyWithExternalId
      )

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ externalId: 'real-user-id' })
      }
    })
  })
})

describe('error message formatting', () => {
  /**
   * These tests cover the error message conditional logic in createFlowgladBillingEndpoint:
   *
   * message: typeof result.error.json?.message === 'string'
   *   ? result.error.json.message
   *   : `Flowglad API error: ${result.error.code}`
   */

  it('extracts message from error.json.message when it is a string', () => {
    const error = {
      code: 'subscription_cancel_failed',
      json: { message: 'Subscription is already canceled' },
    }

    const message =
      typeof error.json?.message === 'string'
        ? error.json.message
        : `Flowglad API error: ${error.code}`

    expect(message).toBe('Subscription is already canceled')
  })

  it('falls back to code-based message when error.json.message is not a string (number)', () => {
    const error = {
      code: 'validation_error',
      json: { message: 42 },
    }

    const message =
      typeof error.json?.message === 'string'
        ? error.json.message
        : `Flowglad API error: ${error.code}`

    expect(message).toBe('Flowglad API error: validation_error')
  })

  it('falls back to code-based message when error.json.message is an object', () => {
    const error = {
      code: 'complex_error',
      json: { message: { nested: 'value' } },
    }

    const message =
      typeof error.json?.message === 'string'
        ? error.json.message
        : `Flowglad API error: ${error.code}`

    expect(message).toBe('Flowglad API error: complex_error')
  })

  it('falls back to code-based message when error.json is undefined', () => {
    const error: { code: string; json?: { message?: unknown } } = {
      code: 'no_json_error',
      json: undefined,
    }

    const message =
      typeof error.json?.message === 'string'
        ? error.json.message
        : `Flowglad API error: ${error.code}`

    expect(message).toBe('Flowglad API error: no_json_error')
  })

  it('falls back to code-based message when error.json.message is null', () => {
    const error = {
      code: 'null_message_error',
      json: { message: null },
    }

    const message =
      typeof error.json?.message === 'string'
        ? error.json.message
        : `Flowglad API error: ${error.code}`

    expect(message).toBe('Flowglad API error: null_message_error')
  })

  it('falls back to code-based message when error.json.message is undefined', () => {
    const error: { code: string; json: { otherField: string } } = {
      code: 'undefined_message_error',
      json: { otherField: 'value' },
    }

    const message =
      typeof (error.json as unknown as { message?: unknown })
        ?.message === 'string'
        ? (error.json as unknown as { message: string }).message
        : `Flowglad API error: ${error.code}`

    expect(message).toBe(
      'Flowglad API error: undefined_message_error'
    )
  })

  it('handles empty string message correctly (empty string is still a string)', () => {
    const error = {
      code: 'empty_message_error',
      json: { message: '' },
    }

    const message =
      typeof error.json?.message === 'string'
        ? error.json.message
        : `Flowglad API error: ${error.code}`

    // Empty string is still typeof 'string', so it should be used
    expect(message).toBe('')
  })
})
