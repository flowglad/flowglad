import {
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'
import {
  CurrencyCode,
  IntervalUnit,
  PriceType,
  SubscriptionStatus,
} from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { Price } from '@db-core/schema/prices'
import type { Product } from '@db-core/schema/products'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupSubscription,
} from '@/../seedDatabase'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { createSubscriptionInputSchema } from '@/server/routers/subscriptionsRouter'
import {
  createDiscardingEffectsContext,
  noopEmitEvent,
  noopInvalidateCache,
} from '@/test-utils/transactionCallbacks'
import { idempotentSendCustomerSubscriptionCreatedNotification } from '@/trigger/notifications/send-customer-subscription-created-notification'
import { idempotentSendOrganizationSubscriptionCreatedNotification } from '@/trigger/notifications/send-organization-subscription-created-notification'
import { CancellationReason } from '@/types'
import { core } from '@/utils/core'
import type { CreateSubscriptionParams } from './types'
import { createSubscriptionWorkflow } from './workflow'

// Mock the notification functions
mock.module(
  '@/trigger/notifications/send-organization-subscription-created-notification',
  () => ({
    idempotentSendOrganizationSubscriptionCreatedNotification: mock(),
  })
)

mock.module(
  '@/trigger/notifications/send-customer-subscription-created-notification',
  () => ({
    idempotentSendCustomerSubscriptionCreatedNotification: mock(),
  })
)

mock.module(
  '@/trigger/notifications/send-customer-subscription-upgraded-notification',
  () => ({
    idempotentSendCustomerSubscriptionUpgradedNotification: mock(),
  })
)

describe('doNotCharge subscription creation', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let paidPrice: Price.Record
  let paidProduct: Product.Record
  let freePrice: Price.Record
  let freeProduct: Product.Record

  beforeEach(async () => {
    mock.clearAllMocks()

    const orgData = await setupOrg()
    organization = orgData.organization

    customer = await setupCustomer({
      organizationId: organization.id,
      stripeCustomerId: `cus_${core.nanoid()}`,
      livemode: true,
    })

    // Create paid product and price
    paidProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: orgData.pricingModel.id,
      name: 'Pro Plan',
      livemode: true,
    })

    paidPrice = await setupPrice({
      productId: paidProduct.id,
      name: 'Pro Tier',
      type: PriceType.Subscription,
      unitPrice: 5000, // $50
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
    })

    // Create free product and price for testing free subscription cancellation
    freeProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: orgData.pricingModel.id,
      name: 'Free Plan',
      livemode: true,
    })

    freePrice = await setupPrice({
      productId: freeProduct.id,
      name: 'Free Tier',
      type: PriceType.Subscription,
      unitPrice: 0,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: true,
      currency: CurrencyCode.USD,
    })
  })

  it('should set subscription item unitPrice to 0 when doNotCharge is true even if price.unitPrice > 0', async () => {
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
      livemode: true,
    })

    const params: CreateSubscriptionParams = {
      customer,
      price: paidPrice,
      product: paidProduct,
      organization,
      quantity: 1,
      livemode: true,
      startDate: new Date(),
      interval: IntervalUnit.Month,
      intervalCount: 1,
      autoStart: true,
      defaultPaymentMethod: paymentMethod,
      doNotCharge: true,
      metadata: { testKey: 'testValue' },
    }

    const { subscription, subscriptionItems } = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await createSubscriptionWorkflow(
            params,
            createDiscardingEffectsContext(transaction)
          )
        )
      })
    )
      .unwrap()
      .unwrap()

    expect(subscriptionItems).toHaveLength(1)
    expect(subscriptionItems[0].unitPrice).toBe(0)
    // Subscription should be active when autoStart is true
    expect(subscription.status).toBe(SubscriptionStatus.Active)
    // Metadata should be preserved
    expect(subscription.metadata).toEqual({ testKey: 'testValue' })
  })

  it('should set isFreePlan to false when doNotCharge is true and price.unitPrice > 0 (treats as paid plan)', async () => {
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
      livemode: true,
    })

    const params: CreateSubscriptionParams = {
      customer,
      price: paidPrice,
      product: paidProduct,
      organization,
      quantity: 1,
      livemode: true,
      startDate: new Date(),
      interval: IntervalUnit.Month,
      intervalCount: 1,
      autoStart: true,
      defaultPaymentMethod: paymentMethod,
      doNotCharge: true,
    }

    const { subscription } = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await createSubscriptionWorkflow(
            params,
            createDiscardingEffectsContext(transaction)
          )
        )
      })
    )
      .unwrap()
      .unwrap()

    expect(subscription.isFreePlan).toBe(false)
  })

  it('should send notifications when doNotCharge is true and price.unitPrice > 0 (treated as paid plan)', async () => {
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
      livemode: true,
    })

    const params: CreateSubscriptionParams = {
      customer,
      price: paidPrice,
      product: paidProduct,
      organization,
      quantity: 1,
      livemode: true,
      startDate: new Date(),
      interval: IntervalUnit.Month,
      intervalCount: 1,
      autoStart: true,
      defaultPaymentMethod: paymentMethod,
      doNotCharge: true,
    }

    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        await createSubscriptionWorkflow(
          params,
          createDiscardingEffectsContext(transaction)
        )
        return Result.ok(undefined)
      })
    ).unwrap()

    expect(
      idempotentSendOrganizationSubscriptionCreatedNotification
    ).toHaveBeenCalledTimes(1)
    expect(
      idempotentSendCustomerSubscriptionCreatedNotification
    ).toHaveBeenCalledTimes(1)
  })

  it('should cancel existing free subscriptions when doNotCharge is true and price.unitPrice > 0 (treated as paid plan)', async () => {
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
      livemode: true,
    })

    // Create an existing free subscription
    const existingFreeSubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: freePrice.id,
      status: SubscriptionStatus.Active,
      livemode: true,
      isFreePlan: true,
    })

    const params: CreateSubscriptionParams = {
      customer,
      price: paidPrice,
      product: paidProduct,
      organization,
      quantity: 1,
      livemode: true,
      startDate: new Date(),
      interval: IntervalUnit.Month,
      intervalCount: 1,
      autoStart: true,
      defaultPaymentMethod: paymentMethod,
      doNotCharge: true,
    }

    const { subscription: newSubscription } = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await createSubscriptionWorkflow(
            params,
            createDiscardingEffectsContext(transaction)
          )
        )
      })
    )
      .unwrap()
      .unwrap()

    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const canceledFree = (
          await selectSubscriptionById(
            existingFreeSubscription.id,
            transaction
          )
        ).unwrap()
        expect(canceledFree.status).toBe(SubscriptionStatus.Canceled)
        expect(canceledFree.cancellationReason).toBe(
          CancellationReason.UpgradedToPaid
        )
        expect(canceledFree.replacedBySubscriptionId).toBe(
          newSubscription.id
        )
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('should set subscription item unitPrice to price.unitPrice when doNotCharge is false', async () => {
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
      livemode: true,
    })

    const params: CreateSubscriptionParams = {
      customer,
      price: paidPrice,
      product: paidProduct,
      organization,
      quantity: 1,
      livemode: true,
      startDate: new Date(),
      interval: IntervalUnit.Month,
      intervalCount: 1,
      autoStart: true,
      defaultPaymentMethod: paymentMethod,
      doNotCharge: false,
    }

    const { subscriptionItems } = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await createSubscriptionWorkflow(
            params,
            createDiscardingEffectsContext(transaction)
          )
        )
      })
    )
      .unwrap()
      .unwrap()

    expect(subscriptionItems).toHaveLength(1)
    expect(subscriptionItems[0].unitPrice).toBe(paidPrice.unitPrice)
  })

  it('should set subscription item unitPrice to price.unitPrice when doNotCharge is undefined', async () => {
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
      livemode: true,
    })

    const params: CreateSubscriptionParams = {
      customer,
      price: paidPrice,
      product: paidProduct,
      organization,
      quantity: 1,
      livemode: true,
      startDate: new Date(),
      interval: IntervalUnit.Month,
      intervalCount: 1,
      autoStart: true,
      defaultPaymentMethod: paymentMethod,
      // doNotCharge not provided
    }

    const { subscriptionItems } = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await createSubscriptionWorkflow(
            params,
            createDiscardingEffectsContext(transaction)
          )
        )
      })
    )
      .unwrap()
      .unwrap()

    expect(subscriptionItems).toHaveLength(1)
    expect(subscriptionItems[0].unitPrice).toBe(paidPrice.unitPrice)
  })

  it('should set all subscription items to unitPrice 0 when doNotCharge is true and quantity > 1', async () => {
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
      livemode: true,
    })

    const params: CreateSubscriptionParams = {
      customer,
      price: paidPrice,
      product: paidProduct,
      organization,
      quantity: 3,
      livemode: true,
      startDate: new Date(),
      interval: IntervalUnit.Month,
      intervalCount: 1,
      autoStart: true,
      defaultPaymentMethod: paymentMethod,
      doNotCharge: true,
    }

    const { subscriptionItems } = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await createSubscriptionWorkflow(
            params,
            createDiscardingEffectsContext(transaction)
          )
        )
      })
    )
      .unwrap()
      .unwrap()

    // All subscription items should have unitPrice 0
    expect(subscriptionItems).toHaveLength(1) // Single item with quantity
    expect(subscriptionItems[0].quantity).toBe(3)
    expect(subscriptionItems[0].unitPrice).toBe(0)
  })

  it('should validate doNotCharge parameter type via Zod schema (boolean only)', () => {
    const baseValidInput = {
      customerId: 'cus-123',
      priceId: 'price-123',
    }

    // Valid boolean values should be accepted
    expect(() => {
      createSubscriptionInputSchema.parse({
        ...baseValidInput,
        doNotCharge: true,
      })
    }).not.toThrow()

    expect(() => {
      createSubscriptionInputSchema.parse({
        ...baseValidInput,
        doNotCharge: false,
      })
    }).not.toThrow()

    // Invalid types should be rejected
    expect(() => {
      createSubscriptionInputSchema.parse({
        ...baseValidInput,
        doNotCharge: 'true',
      })
    }).toThrow()

    expect(() => {
      createSubscriptionInputSchema.parse({
        ...baseValidInput,
        doNotCharge: 1,
      })
    }).toThrow()

    expect(() => {
      createSubscriptionInputSchema.parse({
        ...baseValidInput,
        doNotCharge: null,
      })
    }).toThrow()

    // Undefined should be accepted (optional field)
    expect(() => {
      createSubscriptionInputSchema.parse({
        ...baseValidInput,
        // doNotCharge not provided
      })
    }).not.toThrow()
  })

  it('should treat doNotCharge subscription as paid plan in workflow logic (isFreePlan = false when price.unitPrice > 0)', async () => {
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
      livemode: true,
    })

    // Create an existing free subscription
    const existingFreeSubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: freePrice.id,
      status: SubscriptionStatus.Active,
      livemode: true,
      isFreePlan: true,
    })

    const params: CreateSubscriptionParams = {
      customer,
      price: paidPrice,
      product: paidProduct,
      organization,
      quantity: 1,
      livemode: true,
      startDate: new Date(),
      interval: IntervalUnit.Month,
      intervalCount: 1,
      autoStart: true,
      defaultPaymentMethod: paymentMethod,
      doNotCharge: true,
    }

    const { subscription } = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await createSubscriptionWorkflow(
            params,
            createDiscardingEffectsContext(transaction)
          )
        )
      })
    )
      .unwrap()
      .unwrap()

    // Should be treated as paid plan (isFreePlan = false)
    expect(subscription.isFreePlan).toBe(false)
    // Should cancel existing free subscription (paid plan behavior)
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const canceledFree = (
          await selectSubscriptionById(
            existingFreeSubscription.id,
            transaction
          )
        ).unwrap()
        expect(canceledFree.status).toBe(SubscriptionStatus.Canceled)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('should create subscription as Active when doNotCharge is true and no payment method is provided', async () => {
    const params: CreateSubscriptionParams = {
      customer,
      price: paidPrice,
      product: paidProduct,
      organization,
      quantity: 1,
      livemode: true,
      startDate: new Date(),
      interval: IntervalUnit.Month,
      intervalCount: 1,
      autoStart: true,
      // No defaultPaymentMethod provided
      doNotCharge: true,
    }

    const { subscription, subscriptionItems } = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await createSubscriptionWorkflow(
            params,
            createDiscardingEffectsContext(transaction)
          )
        )
      })
    )
      .unwrap()
      .unwrap()

    expect(subscriptionItems).toHaveLength(1)
    expect(subscriptionItems[0].unitPrice).toBe(0)
    // Subscription should be Active even without payment method when doNotCharge is true
    expect(subscription.status).toBe(SubscriptionStatus.Active)
    expect(subscription.isFreePlan).toBe(false)
    // Verify doNotCharge flag is stored
    expect(subscription.doNotCharge).toBe(true)
    // Verify it persists when queried later
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const retrieved = (
          await selectSubscriptionById(subscription.id, transaction)
        ).unwrap()
        expect(retrieved.doNotCharge).toBe(true)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('should create subscription as Incomplete when doNotCharge is false and no payment method is provided', async () => {
    const params: CreateSubscriptionParams = {
      customer,
      price: paidPrice,
      product: paidProduct,
      organization,
      quantity: 1,
      livemode: true,
      startDate: new Date(),
      interval: IntervalUnit.Month,
      intervalCount: 1,
      autoStart: true,
      // No defaultPaymentMethod provided
      doNotCharge: false,
    }

    const { subscription } = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await createSubscriptionWorkflow(
            params,
            createDiscardingEffectsContext(transaction)
          )
        )
      })
    )
      .unwrap()
      .unwrap()

    // Subscription should be Incomplete without payment method when doNotCharge is false
    expect(subscription.status).toBe(SubscriptionStatus.Incomplete)
  })

  describe('doNotCharge validation with payment methods', () => {
    it('should not create billing run when doNotCharge is true, even with payment method', async () => {
      // This test verifies defensive behavior: even if the workflow is called directly
      // (bypassing API validation), doNotCharge=true should prevent billing run creation.
      // This ensures the workflow is resilient to invalid input combinations.
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
        stripePaymentMethodId: `pm_${core.nanoid()}`,
        livemode: true,
      })

      const params: CreateSubscriptionParams = {
        customer,
        price: paidPrice,
        product: paidProduct,
        organization,
        quantity: 1,
        livemode: true,
        startDate: new Date(),
        interval: IntervalUnit.Month,
        intervalCount: 1,
        autoStart: true,
        defaultPaymentMethod: paymentMethod,
        doNotCharge: true,
      }

      const { billingRun } = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await createSubscriptionWorkflow(
              params,
              createDiscardingEffectsContext(transaction)
            )
          )
        })
      )
        .unwrap()
        .unwrap()

      // No billing run should be created when doNotCharge is true
      // (even though payment method exists, since unitPrice is 0)
      expect(billingRun).toBeNull()
    })
  })
})
