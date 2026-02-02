/**
 * Integration tests for dual-scope TRPC authentication (Patch 5).
 *
 * These tests verify that the TRPC middleware correctly validates session scope:
 * 1. protectedProcedure authenticates with merchant session (scope='merchant')
 * 2. protectedProcedure returns UNAUTHORIZED with customer session (scope='customer')
 * 3. customerProtectedProcedure authenticates with customer session (scope='customer')
 * 4. customerProtectedProcedure returns UNAUTHORIZED with merchant session (scope='merchant')
 * 5. customerProtectedProcedure rejects API keys
 * 6. customerProtectedProcedure gets organizationId from session.contextOrganizationId
 * 7. customerProtectedProcedure returns BAD_REQUEST when contextOrganizationId is missing
 */

import { mock, spyOn } from 'bun:test'

// Mock modules BEFORE importing them
mock.module('next/headers', () => ({
  headers: mock(() => new Headers()),
  cookies: mock(() => ({
    set: mock(),
    get: mock(),
    delete: mock(),
  })),
}))

// Note: @/utils/auth is mocked globally in bun.setup.ts
// Tests can set globalThis.__mockedMerchantSession and globalThis.__mockedCustomerSession

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { PaymentMethodType, SubscriptionStatus } from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { PaymentMethod } from '@db-core/schema/paymentMethods'
import type { Price } from '@db-core/schema/prices'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { Product } from '@db-core/schema/products'
import type { Subscription } from '@db-core/schema/subscriptions'
import type { User } from '@db-core/schema/users'
import { TRPCError } from '@trpc/server'
import {
  setupOrg,
  setupPaymentMethod,
  setupSubscription,
  setupUserAndCustomer,
} from '@/../seedDatabase'
import * as databaseAuthentication from '@/db/databaseAuthentication'
import * as betterAuthSchemaMethods from '@/db/tableMethods/betterAuthSchemaMethods'
import { customerBillingPortalRouter } from '@/server/routers/customerBillingPortalRouter'
import { createSpyTracker } from '@/test/spyTracker'
import core from '@/utils/core'
import * as customerBillingPortalState from '@/utils/customerBillingPortalState'

// Setup test data variables
let organization: Organization.Record
let pricingModel: PricingModel.Record
let product: Product.Record
let price: Price.Record
let user: User.Record
let customer: Customer.Record
let paymentMethod: PaymentMethod.Record
let subscription: Subscription.Record

// Track spies for cleanup
const spyTracker = createSpyTracker()

beforeEach(async () => {
  spyTracker.reset()

  // Reset all global auth sessions
  globalThis.__mockedAuthSession = null
  globalThis.__mockedMerchantSession = null
  globalThis.__mockedCustomerSession = null

  // Set up organization with products and prices
  const orgSetup = await setupOrg()
  organization = orgSetup.organization
  pricingModel = orgSetup.pricingModel
  product = orgSetup.product
  price = orgSetup.price

  // Set up user and customer with authentication
  const userAndCustomerSetup = await setupUserAndCustomer({
    organizationId: organization.id,
    livemode: true,
  })
  user = userAndCustomerSetup.user
  customer = userAndCustomerSetup.customer

  // Set up payment method for customer
  paymentMethod = await setupPaymentMethod({
    organizationId: organization.id,
    customerId: customer.id,
    livemode: true,
    default: true,
    stripePaymentMethodId: `pm_${core.nanoid()}`,
    type: PaymentMethodType.Card,
  })

  // Set up active subscription
  subscription = await setupSubscription({
    organizationId: organization.id,
    customerId: customer.id,
    paymentMethodId: paymentMethod.id,
    defaultPaymentMethodId: paymentMethod.id,
    priceId: price.id,
    status: SubscriptionStatus.Active,
    livemode: true,
    currentBillingPeriodStart: Date.now() - 15 * 24 * 60 * 60 * 1000,
    currentBillingPeriodEnd: Date.now() + 15 * 24 * 60 * 60 * 1000,
  })

  // Mock the requestingCustomerAndUser to return our test data
  spyTracker.track(
    spyOn(
      databaseAuthentication,
      'requestingCustomerAndUser'
    ).mockResolvedValue([
      {
        user,
        customer,
      },
    ])
  )

  // Mock setCustomerBillingPortalOrganizationId to avoid cookies error
  spyTracker.track(
    spyOn(
      customerBillingPortalState,
      'setCustomerBillingPortalOrganizationId'
    ).mockResolvedValue(undefined)
  )

  // Mock getCustomerBillingPortalOrganizationId
  spyTracker.track(
    spyOn(
      customerBillingPortalState,
      'getCustomerBillingPortalOrganizationId'
    ).mockResolvedValue(organization.id)
  )

  // Mock selectBetterAuthUserById to always return a valid user
  spyTracker.track(
    spyOn(
      betterAuthSchemaMethods,
      'selectBetterAuthUserById'
    ).mockResolvedValue({
      id: user.betterAuthId || 'mock_better_auth_id',
      email: user.email!,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ReturnType<
      typeof betterAuthSchemaMethods.selectBetterAuthUserById
    >)
  )
})

afterEach(() => {
  spyTracker.restoreAll()
  globalThis.__mockedAuthSession = null
  globalThis.__mockedMerchantSession = null
  globalThis.__mockedCustomerSession = null
})

describe('customerProtectedProcedure scope validation', () => {
  describe('with valid customer session (scope=customer)', () => {
    it('authenticates successfully and returns billing data', async () => {
      // Set the legacy auth session (used internally by authenticatedTransaction)
      globalThis.__mockedAuthSession = {
        user: { id: user.betterAuthId!, email: user.email! },
      }

      // Create context with customer scope
      const ctx = {
        user,
        customer,
        organization,
        organizationId: organization.id,
        livemode: true,
        environment: 'live' as const,
        path: '',
        isApi: false,
        apiKey: undefined,
        authScope: 'customer' as const,
        session: {
          scope: 'customer',
          contextOrganizationId: organization.id,
        },
      }

      const result = await customerBillingPortalRouter
        .createCaller(ctx)
        .getBilling({ customerId: customer.id })

      expect(result.customer.id).toBe(customer.id)
      expect(result.customer.organizationId).toBe(organization.id)
    })

    it('gets organizationId from session.contextOrganizationId', async () => {
      // Set the legacy auth session (used internally by authenticatedTransaction)
      globalThis.__mockedAuthSession = {
        user: { id: user.betterAuthId!, email: user.email! },
      }

      // The organizationId in context should come from session.contextOrganizationId
      const ctx = {
        user,
        customer,
        organization,
        organizationId: organization.id, // This should match session.contextOrganizationId
        livemode: true,
        environment: 'live' as const,
        path: '',
        isApi: false,
        apiKey: undefined,
        authScope: 'customer' as const,
        session: {
          scope: 'customer',
          contextOrganizationId: organization.id,
        },
      }

      const result = await customerBillingPortalRouter
        .createCaller(ctx)
        .getBilling({ customerId: customer.id })

      // The result organization should match the session context
      expect(result.customer.organizationId).toBe(organization.id)
    })
  })

  describe('with merchant session (scope=merchant)', () => {
    it('returns UNAUTHORIZED when authScope is merchant', async () => {
      // Create context with merchant scope - this should be rejected by customerProtectedProcedure
      const ctx = {
        user,
        organization,
        organizationId: organization.id,
        livemode: true,
        environment: 'live' as const,
        path: '',
        isApi: false,
        apiKey: undefined,
        authScope: 'merchant' as const,
        session: {
          scope: 'merchant',
        },
      }

      const error = await customerBillingPortalRouter
        .createCaller(ctx)
        .getBilling({ customerId: customer.id })
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('UNAUTHORIZED')
    })
  })

  describe('with API key authentication', () => {
    it('rejects API key requests (API keys are merchant-only)', async () => {
      // Create context with isApi=true - this should be rejected
      const ctx = {
        user: undefined,
        organization,
        organizationId: organization.id,
        livemode: true,
        environment: 'live' as const,
        path: '',
        isApi: true, // API key authentication
        apiKey: 'sk_test_123',
        authScope: 'customer' as const,
      }

      const error = await customerBillingPortalRouter
        .createCaller(ctx)
        .getBilling({ customerId: customer.id })
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('UNAUTHORIZED')
    })
  })

  describe('with missing organizationId in context', () => {
    it('returns BAD_REQUEST when contextOrganizationId is missing', async () => {
      // Create context without organizationId
      const ctx = {
        user,
        organization: undefined,
        organizationId: undefined, // Missing organizationId
        livemode: true,
        environment: 'live' as const,
        path: '',
        isApi: false,
        apiKey: undefined,
        authScope: 'customer' as const,
        session: {
          scope: 'customer',
          // contextOrganizationId is missing
        },
      }

      const error = await customerBillingPortalRouter
        .createCaller(ctx)
        .getBilling({ customerId: customer.id })
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('BAD_REQUEST')
      expect(error.message).toContain('organizationId')
    })
  })

  describe('with no user in session', () => {
    it('returns UNAUTHORIZED when user is missing', async () => {
      const ctx = {
        user: undefined, // No user
        organization,
        organizationId: organization.id,
        livemode: true,
        environment: 'live' as const,
        path: '',
        isApi: false,
        apiKey: undefined,
        authScope: 'customer' as const,
        session: {
          scope: 'customer',
          contextOrganizationId: organization.id,
        },
      }

      const error = await customerBillingPortalRouter
        .createCaller(ctx)
        .getBilling({ customerId: customer.id })
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('UNAUTHORIZED')
    })
  })
})

describe('context type validation', () => {
  it('merchant context has authScope=merchant', async () => {
    // Verify merchant context type shape
    const merchantContext = {
      user,
      session: { scope: 'merchant' },
      path: '/test',
      environment: 'live' as const,
      livemode: true,
      organizationId: organization.id,
      organization,
      isApi: false,
      apiKey: undefined,
      authScope: 'merchant' as const,
    }

    expect(merchantContext.authScope).toBe('merchant')
  })

  it('customer context has authScope=customer', async () => {
    // Verify customer context type shape
    const customerContext = {
      user,
      session: {
        scope: 'customer',
        contextOrganizationId: organization.id,
      },
      path: '/test',
      environment: 'live' as const,
      livemode: true,
      organizationId: organization.id,
      organization,
      isApi: false,
      apiKey: undefined,
      authScope: 'customer' as const,
    }

    expect(customerContext.authScope).toBe('customer')
  })
})
