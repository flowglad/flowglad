import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
  afterEach,
} from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupUserAndCustomer,
} from '@/../seedDatabase'
import {
  setDefaultPaymentMethodForCustomer,
  customerBillingCreatePricedCheckoutSession,
} from './customerBilling'
import { Organization } from '@/db/schema/organizations'
import { Customer } from '@/db/schema/customers'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { Price } from '@/db/schema/prices'
import { Product } from '@/db/schema/products'
import { PricingModel } from '@/db/schema/pricingModels'
import { UserRecord } from '@/db/schema/users'
import {
  PaymentMethodType,
  SubscriptionStatus,
  CheckoutSessionType,
} from '@/types'
import core from '@/utils/core'
import {
  selectPaymentMethodById,
  selectPaymentMethods,
  updatePaymentMethod,
} from '@/db/tableMethods/paymentMethodMethods'
import {
  selectSubscriptionById,
  selectSubscriptions,
} from '@/db/tableMethods/subscriptionMethods'
import {
  updateCustomer,
  selectCustomerById,
} from '@/db/tableMethods/customerMethods'
import { CreateCheckoutSessionInput } from '@/db/schema/checkoutSessions'
import * as databaseAuthentication from '@/db/databaseAuthentication'
import * as customerBillingPortalState from '@/utils/customerBillingPortalState'
import * as betterAuthSchemaMethods from '@/db/tableMethods/betterAuthSchemaMethods'

// Mock next/headers to avoid Next.js context errors
vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers()),
  cookies: vi.fn(() => ({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  })),
}))

// Mock auth with factory function to avoid hoisting issues
vi.mock('@/utils/auth', () => ({
  auth: {
    api: {
      signInMagicLink: vi.fn(),
      createUser: vi.fn(),
    },
  },
  getSession: vi.fn().mockResolvedValue(null),
}))

describe('setDefaultPaymentMethodForCustomer', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let paymentMethod1: PaymentMethod.Record
  let paymentMethod2: PaymentMethod.Record
  let subscription1: Subscription.Record

  beforeEach(async () => {
    // Set up organization with pricing model and product
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product
    price = orgData.price

    // Set up customer
    customer = await setupCustomer({
      organizationId: organization.id,
      email: `test-customer-${core.nanoid()}@example.com`,
      livemode: true,
    })

    // Set up first payment method (will be default initially)
    paymentMethod1 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      type: PaymentMethodType.Card,
      livemode: true,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
    })

    // Set up second payment method - setupPaymentMethod always creates as default, so we need to fix this
    paymentMethod2 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      type: PaymentMethodType.Card,
      livemode: true,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
    })

    // Fix the default settings - paymentMethod1 should be default, paymentMethod2 should not
    await adminTransaction(async ({ transaction }) => {
      await updatePaymentMethod(
        {
          id: paymentMethod1.id,
          default: true,
        },
        transaction
      )
      await updatePaymentMethod(
        {
          id: paymentMethod2.id,
          default: false,
        },
        transaction
      )
    })

    // Refresh the payment method records to get updated values
    await adminTransaction(async ({ transaction }) => {
      paymentMethod1 = await selectPaymentMethodById(
        paymentMethod1.id,
        transaction
      )
      paymentMethod2 = await selectPaymentMethodById(
        paymentMethod2.id,
        transaction
      )
    })

    // Set up a subscription using the first payment method
    subscription1 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      defaultPaymentMethodId: paymentMethod1.id,
      status: SubscriptionStatus.Active,
      livemode: true,
    })
  })

  it('should handle payment method that is already default', async () => {
    // Verify initial state - paymentMethod1 is already default
    const initialPm1 = await adminTransaction(
      async ({ transaction }) => {
        return await selectPaymentMethodById(
          paymentMethod1.id,
          transaction
        )
      }
    )
    expect(initialPm1.default).toBe(true)

    // Call setDefaultPaymentMethodForCustomer with already-default payment method
    const result = await adminTransaction(async ({ transaction }) => {
      return await setDefaultPaymentMethodForCustomer(
        { paymentMethodId: paymentMethod1.id },
        transaction
      )
    })

    // Verify the result
    expect(result.success).toBe(true)
    expect(result.paymentMethod.id).toBe(paymentMethod1.id)
    expect(result.paymentMethod.default).toBe(true)

    // Verify payment methods in database
    await adminTransaction(async ({ transaction }) => {
      const pm1 = await selectPaymentMethodById(
        paymentMethod1.id,
        transaction
      )
      const pm2 = await selectPaymentMethodById(
        paymentMethod2.id,
        transaction
      )

      expect(pm1.default).toBe(true)
      expect(pm2.default).toBe(false)

      // Verify subscription still uses paymentMethod1
      const sub = await selectSubscriptionById(
        subscription1.id,
        transaction
      )
      expect(sub.defaultPaymentMethodId).toBe(paymentMethod1.id)
    })
  })

  it('should set a non-default payment method as default and update subscriptions', async () => {
    // Verify initial state
    await adminTransaction(async ({ transaction }) => {
      const pm1 = await selectPaymentMethodById(
        paymentMethod1.id,
        transaction
      )
      const pm2 = await selectPaymentMethodById(
        paymentMethod2.id,
        transaction
      )
      expect(pm1.default).toBe(true)
      expect(pm2.default).toBe(false)

      const sub = await selectSubscriptionById(
        subscription1.id,
        transaction
      )
      expect(sub.defaultPaymentMethodId).toBe(paymentMethod1.id)
    })

    // Set paymentMethod2 as default
    const result = await adminTransaction(async ({ transaction }) => {
      return await setDefaultPaymentMethodForCustomer(
        { paymentMethodId: paymentMethod2.id },
        transaction
      )
    })

    // Verify the result
    expect(result.success).toBe(true)
    expect(result.paymentMethod.id).toBe(paymentMethod2.id)
    expect(result.paymentMethod.default).toBe(true)

    // Verify payment methods in database - pm2 is now default, pm1 is not
    await adminTransaction(async ({ transaction }) => {
      const pm1 = await selectPaymentMethodById(
        paymentMethod1.id,
        transaction
      )
      const pm2 = await selectPaymentMethodById(
        paymentMethod2.id,
        transaction
      )

      expect(pm1.default).toBe(false)
      expect(pm2.default).toBe(true)

      // Verify subscription now uses paymentMethod2
      const sub = await selectSubscriptionById(
        subscription1.id,
        transaction
      )
      expect(sub.defaultPaymentMethodId).toBe(paymentMethod2.id)
    })
  })

  it('should handle customer with no subscriptions', async () => {
    // Create a new customer with no subscriptions
    const customerNoSubs = await setupCustomer({
      organizationId: organization.id,
      email: `no-subs-${core.nanoid()}@example.com`,
      livemode: true,
    })

    // Create two payment methods for this customer
    const pm1NoSubs = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customerNoSubs.id,
      type: PaymentMethodType.Card,
      default: true,
      livemode: true,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
    })

    const pm2NoSubs = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customerNoSubs.id,
      type: PaymentMethodType.Card,
      default: false,
      livemode: true,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
    })

    // Set the second payment method as default
    const result = await adminTransaction(async ({ transaction }) => {
      return await setDefaultPaymentMethodForCustomer(
        { paymentMethodId: pm2NoSubs.id },
        transaction
      )
    })

    // Verify the result
    expect(result.success).toBe(true)
    expect(result.paymentMethod.id).toBe(pm2NoSubs.id)
    expect(result.paymentMethod.default).toBe(true)

    // Verify payment methods in database
    await adminTransaction(async ({ transaction }) => {
      const pm1 = await selectPaymentMethodById(
        pm1NoSubs.id,
        transaction
      )
      const pm2 = await selectPaymentMethodById(
        pm2NoSubs.id,
        transaction
      )

      expect(pm1.default).toBe(false)
      expect(pm2.default).toBe(true)

      // Verify no subscriptions exist for this customer
      const subs = await selectSubscriptions(
        { customerId: customerNoSubs.id },
        transaction
      )
      expect(subs.length).toBe(0)
    })
  })

  it('should update multiple subscriptions to new default payment method', async () => {
    // Create additional subscriptions
    const subscription2 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      defaultPaymentMethodId: paymentMethod1.id,
      status: SubscriptionStatus.Active,
      livemode: true,
    })

    const subscription3 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      defaultPaymentMethodId: paymentMethod2.id,
      status: SubscriptionStatus.Active,
      livemode: true,
    })

    // Verify initial state
    await adminTransaction(async ({ transaction }) => {
      const sub1 = await selectSubscriptionById(
        subscription1.id,
        transaction
      )
      const sub2 = await selectSubscriptionById(
        subscription2.id,
        transaction
      )
      const sub3 = await selectSubscriptionById(
        subscription3.id,
        transaction
      )

      expect(sub1.defaultPaymentMethodId).toBe(paymentMethod1.id)
      expect(sub2.defaultPaymentMethodId).toBe(paymentMethod1.id)
      expect(sub3.defaultPaymentMethodId).toBe(paymentMethod2.id)
    })

    // Set paymentMethod2 as default
    const result = await adminTransaction(async ({ transaction }) => {
      return await setDefaultPaymentMethodForCustomer(
        { paymentMethodId: paymentMethod2.id },
        transaction
      )
    })

    // Verify the result
    expect(result.success).toBe(true)

    // Verify all subscriptions now use paymentMethod2
    await adminTransaction(async ({ transaction }) => {
      const sub1 = await selectSubscriptionById(
        subscription1.id,
        transaction
      )
      const sub2 = await selectSubscriptionById(
        subscription2.id,
        transaction
      )
      const sub3 = await selectSubscriptionById(
        subscription3.id,
        transaction
      )

      expect(sub1.defaultPaymentMethodId).toBe(paymentMethod2.id)
      expect(sub2.defaultPaymentMethodId).toBe(paymentMethod2.id)
      expect(sub3.defaultPaymentMethodId).toBe(paymentMethod2.id)

      // Verify payment methods
      const pm1 = await selectPaymentMethodById(
        paymentMethod1.id,
        transaction
      )
      const pm2 = await selectPaymentMethodById(
        paymentMethod2.id,
        transaction
      )

      expect(pm1.default).toBe(false)
      expect(pm2.default).toBe(true)
    })
  })

  it('should only update active subscriptions when setting default', async () => {
    // Create a canceled subscription
    const canceledSub = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      defaultPaymentMethodId: paymentMethod1.id,
      status: SubscriptionStatus.Canceled,
      livemode: true,
    })

    // Create an active subscription
    const activeSub = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      defaultPaymentMethodId: paymentMethod1.id,
      status: SubscriptionStatus.Active,
      livemode: true,
    })

    // Set paymentMethod2 as default
    const result = await adminTransaction(async ({ transaction }) => {
      return await setDefaultPaymentMethodForCustomer(
        { paymentMethodId: paymentMethod2.id },
        transaction
      )
    })

    expect(result.success).toBe(true)

    // Verify subscriptions
    await adminTransaction(async ({ transaction }) => {
      const canceled = await selectSubscriptionById(
        canceledSub.id,
        transaction
      )
      const active = await selectSubscriptionById(
        activeSub.id,
        transaction
      )
      const original = await selectSubscriptionById(
        subscription1.id,
        transaction
      )

      // Canceled subscription should not be updated
      expect(canceled.defaultPaymentMethodId).toBe(paymentMethod1.id)

      // Active subscriptions should be updated
      expect(active.defaultPaymentMethodId).toBe(paymentMethod2.id)
      expect(original.defaultPaymentMethodId).toBe(paymentMethod2.id)

      // Verify payment methods
      const pm1 = await selectPaymentMethodById(
        paymentMethod1.id,
        transaction
      )
      const pm2 = await selectPaymentMethodById(
        paymentMethod2.id,
        transaction
      )

      expect(pm1.default).toBe(false)
      expect(pm2.default).toBe(true)
    })
  })

  it('should throw error when payment method does not exist', async () => {
    const nonExistentId = `pm_${core.nanoid()}`

    // Attempt to set a non-existent payment method as default
    await expect(
      adminTransaction(async ({ transaction }) => {
        return await setDefaultPaymentMethodForCustomer(
          { paymentMethodId: nonExistentId },
          transaction
        )
      })
    ).rejects.toThrow()

    // Verify existing payment methods remain unchanged
    await adminTransaction(async ({ transaction }) => {
      const pm1 = await selectPaymentMethodById(
        paymentMethod1.id,
        transaction
      )
      const pm2 = await selectPaymentMethodById(
        paymentMethod2.id,
        transaction
      )

      expect(pm1.default).toBe(true)
      expect(pm2.default).toBe(false)

      // Verify subscription remains unchanged
      const sub = await selectSubscriptionById(
        subscription1.id,
        transaction
      )
      expect(sub.defaultPaymentMethodId).toBe(paymentMethod1.id)
    })
  })

  it('should handle setting same payment method as default multiple times', async () => {
    // First call - set paymentMethod2 as default
    const result1 = await adminTransaction(
      async ({ transaction }) => {
        return await setDefaultPaymentMethodForCustomer(
          { paymentMethodId: paymentMethod2.id },
          transaction
        )
      }
    )

    expect(result1.success).toBe(true)
    expect(result1.paymentMethod.default).toBe(true)

    // Verify state after first call
    await adminTransaction(async ({ transaction }) => {
      const pm2 = await selectPaymentMethodById(
        paymentMethod2.id,
        transaction
      )
      expect(pm2.default).toBe(true)

      const sub = await selectSubscriptionById(
        subscription1.id,
        transaction
      )
      expect(sub.defaultPaymentMethodId).toBe(paymentMethod2.id)
    })

    // Second call - set paymentMethod2 as default again (already default)
    const result2 = await adminTransaction(
      async ({ transaction }) => {
        return await setDefaultPaymentMethodForCustomer(
          { paymentMethodId: paymentMethod2.id },
          transaction
        )
      }
    )

    expect(result2.success).toBe(true)
    expect(result2.paymentMethod.default).toBe(true)

    // Verify state remains the same after second call
    await adminTransaction(async ({ transaction }) => {
      const pm1 = await selectPaymentMethodById(
        paymentMethod1.id,
        transaction
      )
      const pm2 = await selectPaymentMethodById(
        paymentMethod2.id,
        transaction
      )

      expect(pm1.default).toBe(false)
      expect(pm2.default).toBe(true)

      // Subscription should still use paymentMethod2
      const sub = await selectSubscriptionById(
        subscription1.id,
        transaction
      )
      expect(sub.defaultPaymentMethodId).toBe(paymentMethod2.id)
    })
  })
})

describe('customerBillingCreatePricedCheckoutSession', () => {
  let organization: Organization.Record
  let organization2: Organization.Record
  let pricingModel: PricingModel.Record
  let pricingModel2: PricingModel.Record
  let product: Product.Record
  let product2: Product.Record
  let price: Price.Record
  let price2: Price.Record
  let customer: Customer.Record
  let user: UserRecord

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks()

    // Set up first organization with pricing model and product
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product
    price = orgData.price

    // Set up second organization with different pricing model to test access control
    const orgData2 = await setupOrg()
    organization2 = orgData2.organization
    pricingModel2 = orgData2.pricingModel
    product2 = orgData2.product
    price2 = orgData2.price

    // Set up user and customer with pricing model
    const userAndCustomerSetup = await setupUserAndCustomer({
      organizationId: organization.id,
      livemode: true,
    })
    user = userAndCustomerSetup.user
    customer = userAndCustomerSetup.customer

    // Update customer to have the pricing model
    await adminTransaction(async ({ transaction }) => {
      await updateCustomer(
        {
          id: customer.id,
          pricingModelId: pricingModel.id,
        },
        transaction
      )
      const updatedCustomer = await selectCustomerById(
        customer.id,
        transaction
      )
      customer.pricingModelId = updatedCustomer.pricingModelId
    })

    // Mock the requestingCustomerAndUser to return our test data
    vi.spyOn(
      databaseAuthentication,
      'requestingCustomerAndUser'
    ).mockResolvedValue([
      {
        user,
        customer,
      },
    ])

    // Mock the organization ID retrieval for customer billing portal
    vi.spyOn(
      customerBillingPortalState,
      'getCustomerBillingPortalOrganizationId'
    ).mockResolvedValue(organization.id)

    // Mock setCustomerBillingPortalOrganizationId to avoid cookies error
    vi.spyOn(
      customerBillingPortalState,
      'setCustomerBillingPortalOrganizationId'
    ).mockResolvedValue(undefined)

    // Mock selectBetterAuthUserById to always return a valid user
    vi.spyOn(
      betterAuthSchemaMethods,
      'selectBetterAuthUserById'
    ).mockResolvedValue({
      id: user.betterAuthId || 'mock_better_auth_id',
      email: user.email!,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    // Mock getDatabaseAuthenticationInfo to return proper auth info for customer
    vi.spyOn(
      databaseAuthentication,
      'getDatabaseAuthenticationInfo'
    ).mockResolvedValue({
      userId: user.id,
      livemode: true,
      jwtClaim: {
        sub: user.id,
        user_metadata: {
          id: user.id,
          email: user.email!,
          aud: 'stub',
          role: 'customer',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        app_metadata: {
          provider: '',
        },
        email: user.email!,
        role: 'customer',
        organization_id: organization.id,
        session_id: 'mock_session_123',
        aud: 'stub',
      } as any,
    } as any)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should fail when price is not accessible to customer (from different organization)', async () => {
    // price2 belongs to a different organization
    const checkoutSessionInput: CreateCheckoutSessionInput['checkoutSession'] =
      {
        customerExternalId: customer.externalId,
        priceId: price2.id, // Price from different organization
        type: CheckoutSessionType.Product,
        successUrl: 'http://success.url',
        cancelUrl: 'http://cancel.url',
      }

    // When using authenticatedTransaction with the wrong organization's price,
    // the price select will fail due to RLS policies
    await expect(
      customerBillingCreatePricedCheckoutSession({
        checkoutSessionInput,
        customer,
      })
    ).rejects.toThrow()
  })

  it('should succeed when price is accessible to customer', async () => {
    // Use price from same organization that customer has access to
    const checkoutSessionInput: CreateCheckoutSessionInput['checkoutSession'] =
      {
        customerExternalId: customer.externalId,
        priceId: price.id, // Price from same organization/pricing model
        type: CheckoutSessionType.Product,
        successUrl: 'http://success.url',
        cancelUrl: 'http://cancel.url',
      }

    const result = await customerBillingCreatePricedCheckoutSession({
      checkoutSessionInput,
      customer,
    })

    expect(result).toBeDefined()
    expect(result.checkoutSession).toBeDefined()
    expect(result.checkoutSession.priceId).toBe(price.id)
    expect(result.checkoutSession.customerId).toBe(customer.id)
    expect(result.checkoutSession.organizationId).toBe(
      organization.id
    )
    expect(result.checkoutSession.type).toBe(
      CheckoutSessionType.Product
    )
    expect(result.url).toContain('/checkout/')
  })

  it('should fail with invalid checkout session type', async () => {
    const checkoutSessionInput: CreateCheckoutSessionInput['checkoutSession'] =
      {
        customerExternalId: customer.externalId,
        type: CheckoutSessionType.AddPaymentMethod, // Invalid type for this function
        successUrl: 'http://success.url',
        cancelUrl: 'http://cancel.url',
      }

    await expect(
      customerBillingCreatePricedCheckoutSession({
        // @ts-expect-error - testing invalid type
        checkoutSessionInput,
        customer,
      })
    ).rejects.toThrow(
      'Invalid checkout session type. Only product and activate_subscription checkout sessions are supported. Received type: add_payment_method'
    )
  })

  it('should fail when customer external ID does not match', async () => {
    const checkoutSessionInput: CreateCheckoutSessionInput['checkoutSession'] =
      {
        customerExternalId: 'wrong-external-id',
        priceId: price.id,
        type: CheckoutSessionType.Product,
        successUrl: 'http://success.url',
        cancelUrl: 'http://cancel.url',
      }

    await expect(
      customerBillingCreatePricedCheckoutSession({
        checkoutSessionInput,
        customer,
      })
    ).rejects.toThrow(
      'You do not have permission to create a checkout session for this customer'
    )
  })

  it('should allow ActivateSubscription checkout session type', async () => {
    // Create a subscription that needs activation
    const subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      status: SubscriptionStatus.Incomplete,
      livemode: true,
    })

    const checkoutSessionInput: CreateCheckoutSessionInput['checkoutSession'] =
      {
        customerExternalId: customer.externalId,
        priceId: price.id,
        type: CheckoutSessionType.ActivateSubscription,
        targetSubscriptionId: subscription.id,
        successUrl: 'http://success.url',
        cancelUrl: 'http://cancel.url',
      }

    const result = await customerBillingCreatePricedCheckoutSession({
      checkoutSessionInput,
      customer,
    })

    expect(result).toBeDefined()
    expect(result.checkoutSession).toBeDefined()
    expect(result.checkoutSession.type).toBe(
      CheckoutSessionType.ActivateSubscription
    )
    expect(result.checkoutSession.targetSubscriptionId).toBe(
      subscription.id
    )
    expect(result.checkoutSession.priceId).toBe(price.id)
  })

  it('should fail when customer has no pricing model and tries to access price', async () => {
    // Create a new user and customer without pricing model
    const userAndCustomerNoPricing = await setupUserAndCustomer({
      organizationId: organization.id,
      livemode: true,
    })
    const userNoPricing = userAndCustomerNoPricing.user
    const customerWithoutPricingModel =
      userAndCustomerNoPricing.customer

    // Explicitly set pricing model to null
    await adminTransaction(async ({ transaction }) => {
      await updateCustomer(
        {
          id: customerWithoutPricingModel.id,
          pricingModelId: null,
        },
        transaction
      )
      const updatedCustomer = await selectCustomerById(
        customerWithoutPricingModel.id,
        transaction
      )
      customerWithoutPricingModel.pricingModelId =
        updatedCustomer.pricingModelId
    })

    // Update mock for this specific test to use the customer without pricing model
    vi.spyOn(
      databaseAuthentication,
      'requestingCustomerAndUser'
    ).mockResolvedValue([
      {
        user: userNoPricing,
        customer: customerWithoutPricingModel,
      },
    ])

    // Update mock for getDatabaseAuthenticationInfo for this user
    vi.spyOn(
      databaseAuthentication,
      'getDatabaseAuthenticationInfo'
    ).mockResolvedValue({
      userId: userNoPricing.id,
      livemode: true,
      jwtClaim: {
        sub: userNoPricing.id,
        user_metadata: {
          id: userNoPricing.id,
          email: userNoPricing.email!,
          aud: 'stub',
          role: 'customer',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        app_metadata: {
          provider: '',
        },
        email: userNoPricing.email!,
        role: 'customer',
        organization_id: organization.id,
        session_id: 'mock_session_123',
        aud: 'stub',
      } as any,
    } as any)

    const checkoutSessionInput: CreateCheckoutSessionInput['checkoutSession'] =
      {
        customerExternalId: customerWithoutPricingModel.externalId,
        priceId: price.id,
        type: CheckoutSessionType.Product,
        successUrl: 'http://success.url',
        cancelUrl: 'http://cancel.url',
      }

    // This should fail because the customer has no pricing model
    await expect(
      customerBillingCreatePricedCheckoutSession({
        checkoutSessionInput,
        customer: customerWithoutPricingModel,
      })
    ).rejects.toThrow()
  })
})
