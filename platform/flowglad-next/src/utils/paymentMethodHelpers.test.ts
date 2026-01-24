import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { Result } from 'better-result'
import type Stripe from 'stripe'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
} from '@/../seedDatabase'
import { comprehensiveAdminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { PricingModel } from '@/db/schema/pricingModels'
import { selectPaymentMethods } from '@/db/tableMethods/paymentMethodMethods'
import { PaymentMethodType } from '@/types'
import { core } from '@/utils/core'

// Import actual stripe module functions we want to keep
import * as actualStripe from '@/utils/stripe'

// Create mock for getStripePaymentMethod
const mockGetStripePaymentMethod =
  mock<typeof actualStripe.getStripePaymentMethod>()

// Mock the stripe utils
mock.module('@/utils/stripe', () => ({
  ...actualStripe,
  getStripePaymentMethod: mockGetStripePaymentMethod,
}))

import {
  paymentMethodForStripePaymentMethodId,
  paymentMethodInsertFromStripeCardPaymentMethod,
} from './paymentMethodHelpers'

describe('paymentMethodInsertFromStripeCardPaymentMethod', () => {
  it('should correctly transform Stripe payment method to insert', () => {
    const mockStripePaymentMethod: Stripe.PaymentMethod = {
      id: 'pm_1Qp9kURasdfasfasfda6tcYh',
      object: 'payment_method',
      allow_redisplay: 'unspecified',
      billing_details: {
        address: {
          city: 'New York City',
          country: 'US',
          line1: '___ ____ ____',
          line2: null,
          postal_code: '00000',
          state: 'NY',
        },
        email: 'test@example.com',
        name: 'Test User',
        phone: null,
      },
      card: {
        brand: 'visa',
        checks: {
          address_line1_check: 'pass',
          address_postal_code_check: 'pass',
          cvc_check: 'pass',
        },
        country: 'US',
        display_brand: 'visa',
        exp_month: 2,
        exp_year: 2029,
        fingerprint: 'BLKJALFKJSLGJSF',
        funding: 'credit',
        generated_from: null,
        last4: '4242',
        networks: {
          available: ['visa'],
          preferred: null,
        },
        three_d_secure_usage: {
          supported: true,
        },
        wallet: null,
      },
      created: 1738766322,
      customer: 'cus_BLKJSLKJGB',
      livemode: false,
      metadata: {},
      type: 'card',
    }
    const params = {
      livemode: false,
      customerId: 'cust_123',
    }
    const result = paymentMethodInsertFromStripeCardPaymentMethod(
      mockStripePaymentMethod,
      params
    )
    expect(result.type).toEqual(PaymentMethodType.Card)
    expect(result.livemode).toEqual(params.livemode)
    expect(result.customerId).toEqual(params.customerId)
    expect(result.billingDetails).toEqual({
      name: 'Test User',
      email: 'test@example.com',
      address: {
        city: 'New York City',
        country: 'US',
        line1: '___ ____ ____',
        line2: null,
        postal_code: '00000',
        state: 'NY',
      },
    })
    // should not have nested address
    expect(result.billingDetails.address.address).toBeUndefined()
  })
})

describe('paymentMethodForStripePaymentMethodId', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let customer: Customer.Record

  beforeEach(async () => {
    // Reset mock before each test
    mockGetStripePaymentMethod.mockReset()

    // Set default mock implementation
    mockGetStripePaymentMethod.mockImplementation(
      async (paymentMethodId: string) => {
        return {
          id: paymentMethodId,
          object: 'payment_method',
          type: 'card',
          billing_details: {
            name: 'John Doe',
            email: 'john.doe@example.com',
            address: {
              line1: '123 Test St',
              line2: 'Apt 1',
              city: 'Test City',
              state: 'Test State',
              postal_code: '12345',
              country: 'US',
            },
          },
          card: {
            brand: 'visa',
            last4: '1234',
            exp_month: 12,
            exp_year: 2025,
          },
        } as Stripe.PaymentMethod
      }
    )

    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    customer = await setupCustomer({
      organizationId: organization.id,
      email: `test+${core.nanoid()}@test.com`,
      livemode: true,
    })
  })

  it('should create a new payment method when no existing payment method with the stripePaymentMethodId exists', async () => {
    const stripePaymentMethodId = `pm_${core.nanoid()}`

    const result = await comprehensiveAdminTransaction(
      async ({
        transaction,
        cacheRecomputationContext,
        invalidateCache,
        emitEvent,
        enqueueLedgerCommand,
      }) => {
        const paymentMethod =
          await paymentMethodForStripePaymentMethodId(
            {
              stripePaymentMethodId,
              livemode: true,
              customerId: customer.id,
            },
            {
              transaction,
              cacheRecomputationContext,
              invalidateCache,
              emitEvent,
              enqueueLedgerCommand,
            }
          )

        // Verify the payment method was created with correct properties
        expect(paymentMethod.stripePaymentMethodId).toBe(
          stripePaymentMethodId
        )
        expect(paymentMethod.customerId).toBe(customer.id)
        expect(paymentMethod.type).toBe(PaymentMethodType.Card)
        expect(paymentMethod.pricingModelId).toBe(pricingModel.id)
        expect(paymentMethod.livemode).toBe(true)
        // The mock returns these billing details
        expect(paymentMethod.billingDetails.name).toBe('John Doe')
        expect(paymentMethod.billingDetails.email).toBe(
          'john.doe@example.com'
        )

        return Result.ok(paymentMethod)
      }
    )

    // Verify the payment method was persisted to the database
    await comprehensiveAdminTransaction(async ({ transaction }) => {
      const [persistedPaymentMethod] = await selectPaymentMethods(
        { stripePaymentMethodId },
        transaction
      )
      // Use toMatchObject instead of toBeDefined for more precise assertion
      expect(persistedPaymentMethod).toMatchObject({
        id: result.id,
        customerId: customer.id,
        stripePaymentMethodId,
      })
      return Result.ok(null)
    })
  })

  it('should return the existing payment method when one with the stripePaymentMethodId already exists', async () => {
    const stripePaymentMethodId = `pm_${core.nanoid()}`

    // Create an existing payment method with this stripePaymentMethodId
    const existingPaymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode: true,
      type: PaymentMethodType.Card,
      stripePaymentMethodId,
    })

    await comprehensiveAdminTransaction(
      async ({
        transaction,
        cacheRecomputationContext,
        invalidateCache,
        emitEvent,
        enqueueLedgerCommand,
      }) => {
        const paymentMethod =
          await paymentMethodForStripePaymentMethodId(
            {
              stripePaymentMethodId,
              livemode: true,
              customerId: customer.id,
            },
            {
              transaction,
              cacheRecomputationContext,
              invalidateCache,
              emitEvent,
              enqueueLedgerCommand,
            }
          )

        // Verify the function returned the existing payment method
        expect(paymentMethod.id).toBe(existingPaymentMethod.id)
        expect(paymentMethod.stripePaymentMethodId).toBe(
          stripePaymentMethodId
        )
        expect(paymentMethod.customerId).toBe(customer.id)
        expect(paymentMethod.pricingModelId).toBe(
          existingPaymentMethod.pricingModelId
        )

        return Result.ok(paymentMethod)
      }
    )

    // Verify no duplicate payment methods were created
    await comprehensiveAdminTransaction(async ({ transaction }) => {
      const paymentMethodsWithStripeId = await selectPaymentMethods(
        { stripePaymentMethodId },
        transaction
      )
      expect(paymentMethodsWithStripeId).toHaveLength(1)
      expect(paymentMethodsWithStripeId[0]!.id).toBe(
        existingPaymentMethod.id
      )
      return Result.ok(null)
    })
  })
})
