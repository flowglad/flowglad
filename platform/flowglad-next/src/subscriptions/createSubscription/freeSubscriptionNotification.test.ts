import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import {
  createDiscardingEffectsContext,
  noopEmitEvent,
  noopInvalidateCache,
} from '@/test-utils/transactionCallbacks'
import { IntervalUnit, PriceType, SubscriptionStatus } from '@/types'
import { core } from '@/utils/core'
import type { CreateSubscriptionParams } from './types'
import { createSubscriptionWorkflow } from './workflow'

// Mock the notification functions
vi.mock(
  '@/trigger/notifications/send-organization-subscription-created-notification',
  () => ({
    idempotentSendOrganizationSubscriptionCreatedNotification:
      vi.fn(),
  })
)

vi.mock(
  '@/trigger/notifications/send-customer-subscription-created-notification',
  () => ({
    idempotentSendCustomerSubscriptionCreatedNotification: vi.fn(),
  })
)

vi.mock(
  '@/trigger/notifications/send-customer-subscription-upgraded-notification',
  () => ({
    idempotentSendCustomerSubscriptionUpgradedNotification: vi.fn(),
  })
)

describe('Free Subscription Notification Behavior', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let freePrice: Price.Record
  let paidPrice: Price.Record
  let freeProduct: Product.Record
  let paidProduct: Product.Record

  beforeEach(async () => {
    vi.clearAllMocks()

    // Set up organization and products
    const orgData = await setupOrg()
    organization = orgData.organization

    // Create customer
    customer = await setupCustomer({
      organizationId: organization.id,
      stripeCustomerId: `cus_${core.nanoid()}`,
      livemode: true,
    })

    // Create free product and price
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
      unitPrice: 0, // Free tier
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: true,
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
    })
  })

  it('should NOT send notification when creating a free subscription (unitPrice = 0)', async () => {
    const {
      idempotentSendOrganizationSubscriptionCreatedNotification,
      // biome-ignore lint/plugin: dynamic import required to access mocked module
    } = await import(
      '@/trigger/notifications/send-organization-subscription-created-notification'
    )

    const params: CreateSubscriptionParams = {
      customer,
      price: freePrice,
      product: freeProduct,
      organization,
      quantity: 1,
      livemode: true,
      startDate: new Date(),
      interval: IntervalUnit.Month,
      intervalCount: 1,
      autoStart: true,
      discountRedemption: null,
      metadata: {},
      name: 'Free Subscription',
    }

    await adminTransaction(async ({ transaction }) => {
      await createSubscriptionWorkflow(
        params,
        createDiscardingEffectsContext(transaction)
      )
    })

    // Verify notification was NOT sent for free subscription
    expect(
      idempotentSendOrganizationSubscriptionCreatedNotification
    ).not.toHaveBeenCalled()
  })

  it('should send notification when creating a paid subscription (unitPrice > 0)', async () => {
    const {
      idempotentSendOrganizationSubscriptionCreatedNotification,
      // biome-ignore lint/plugin: dynamic import required to access mocked module
    } = await import(
      '@/trigger/notifications/send-organization-subscription-created-notification'
    )

    // Create payment method for paid subscription
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
      metadata: {},
      name: 'Paid Subscription',
    }

    await adminTransaction(async ({ transaction }) => {
      await createSubscriptionWorkflow(
        params,
        createDiscardingEffectsContext(transaction)
      )
    })

    // Verify notification WAS sent for paid subscription
    expect(
      idempotentSendOrganizationSubscriptionCreatedNotification
    ).toHaveBeenCalledTimes(1)
  })

  it('should NOT send notification for free subscription regardless of slug name', async () => {
    const {
      idempotentSendOrganizationSubscriptionCreatedNotification,
      // biome-ignore lint/plugin: dynamic import required to access mocked module
    } = await import(
      '@/trigger/notifications/send-organization-subscription-created-notification'
    )

    // Create a free price with a different slug (not 'free')
    const freePriceWithDifferentSlug = await setupPrice({
      productId: freeProduct.id,
      name: 'Trial Tier',
      slug: 'trial', // Different slug, but still free
      type: PriceType.Subscription,
      unitPrice: 0, // Still free
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
    })

    const params: CreateSubscriptionParams = {
      customer,
      price: freePriceWithDifferentSlug,
      product: freeProduct,
      organization,
      quantity: 1,
      livemode: true,
      startDate: new Date(),
      interval: IntervalUnit.Month,
      intervalCount: 1,
      autoStart: true,
      discountRedemption: null,
      metadata: {},
      name: 'Trial Subscription',
    }

    await adminTransaction(async ({ transaction }) => {
      await createSubscriptionWorkflow(
        params,
        createDiscardingEffectsContext(transaction)
      )
    })

    // Verify notification was NOT sent even though slug is not 'free'
    expect(
      idempotentSendOrganizationSubscriptionCreatedNotification
    ).not.toHaveBeenCalled()
  })
})

describe('Trial Subscription Notification Behavior', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let trialPrice: Price.Record
  let trialProduct: Product.Record

  beforeEach(async () => {
    vi.clearAllMocks()

    // Set up organization and products
    const orgData = await setupOrg()
    organization = orgData.organization

    // Create customer
    customer = await setupCustomer({
      organizationId: organization.id,
      stripeCustomerId: `cus_${core.nanoid()}`,
      livemode: true,
    })

    // Create trial product and price
    trialProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: orgData.pricingModel.id,
      name: 'Pro Plan with Trial',
      livemode: true,
    })

    trialPrice = await setupPrice({
      productId: trialProduct.id,
      name: 'Pro Plan with Trial',
      type: PriceType.Subscription,
      unitPrice: 5000, // $50
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      trialPeriodDays: 14,
      livemode: true,
      isDefault: true,
    })
  })

  it('should send customer notification when creating a trial subscription WITH payment method', async () => {
    const {
      idempotentSendCustomerSubscriptionCreatedNotification,
      // biome-ignore lint/plugin: dynamic import required to access mocked module
    } = await import(
      '@/trigger/notifications/send-customer-subscription-created-notification'
    )

    const {
      idempotentSendOrganizationSubscriptionCreatedNotification,
      // biome-ignore lint/plugin: dynamic import required to access mocked module
    } = await import(
      '@/trigger/notifications/send-organization-subscription-created-notification'
    )

    // Create payment method for the subscription
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      stripePaymentMethodId: `pm_${core.nanoid()}`,
      livemode: true,
    })

    const trialEnd = Date.now() + 14 * 24 * 60 * 60 * 1000 // 14 days from now

    const params: CreateSubscriptionParams = {
      customer,
      price: trialPrice,
      product: trialProduct,
      organization,
      quantity: 1,
      livemode: true,
      startDate: new Date(),
      interval: IntervalUnit.Month,
      intervalCount: 1,
      autoStart: true,
      defaultPaymentMethod: paymentMethod,
      trialEnd,
      metadata: {},
      name: 'Trial Subscription with Payment',
    }

    const { subscription } = (
      await adminTransaction(async ({ transaction }) => {
        return createSubscriptionWorkflow(
          params,
          createDiscardingEffectsContext(transaction)
        )
      })
    ).unwrap()

    // Verify subscription is in trialing status
    expect(subscription.status).toBe(SubscriptionStatus.Trialing)

    // Verify customer notification WAS sent (trial with payment method)
    expect(
      idempotentSendCustomerSubscriptionCreatedNotification
    ).toHaveBeenCalledTimes(1)

    // Verify organization notification was also sent
    expect(
      idempotentSendOrganizationSubscriptionCreatedNotification
    ).toHaveBeenCalledTimes(1)
  })

  it('should NOT send customer notification when creating a trial subscription WITHOUT payment method', async () => {
    const {
      idempotentSendCustomerSubscriptionCreatedNotification,
      // biome-ignore lint/plugin: dynamic import required to access mocked module
    } = await import(
      '@/trigger/notifications/send-customer-subscription-created-notification'
    )

    const {
      idempotentSendOrganizationSubscriptionCreatedNotification,
      // biome-ignore lint/plugin: dynamic import required to access mocked module
    } = await import(
      '@/trigger/notifications/send-organization-subscription-created-notification'
    )

    const trialEnd = Date.now() + 14 * 24 * 60 * 60 * 1000 // 14 days from now

    const params: CreateSubscriptionParams = {
      customer,
      price: trialPrice,
      product: trialProduct,
      organization,
      quantity: 1,
      livemode: true,
      startDate: new Date(),
      interval: IntervalUnit.Month,
      intervalCount: 1,
      autoStart: true,
      // NO defaultPaymentMethod - trial started without payment details
      trialEnd,
      metadata: {},
      name: 'Trial Subscription without Payment',
    }

    const { subscription } = (
      await adminTransaction(async ({ transaction }) => {
        return createSubscriptionWorkflow(
          params,
          createDiscardingEffectsContext(transaction)
        )
      })
    ).unwrap()

    // Verify subscription is in trialing status
    expect(subscription.status).toBe(SubscriptionStatus.Trialing)

    // Verify customer notification was NOT sent (trial without payment method)
    // This is the critical fix: no billing commitment exists, so don't send "Subscription Confirmed"
    expect(
      idempotentSendCustomerSubscriptionCreatedNotification
    ).not.toHaveBeenCalled()

    // Organization notification SHOULD still be sent (internal awareness)
    expect(
      idempotentSendOrganizationSubscriptionCreatedNotification
    ).toHaveBeenCalledTimes(1)
  })

  it('should send customer notification for non-trial paid subscription without payment method', async () => {
    const {
      idempotentSendCustomerSubscriptionCreatedNotification,
      // biome-ignore lint/plugin: dynamic import required to access mocked module
    } = await import(
      '@/trigger/notifications/send-customer-subscription-created-notification'
    )

    // Create a paid price WITHOUT trial period
    const paidPriceNoTrial = await setupPrice({
      productId: trialProduct.id,
      name: 'Pro Plan No Trial',
      type: PriceType.Subscription,
      unitPrice: 5000, // $50
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      trialPeriodDays: 0, // No trial
      livemode: true,
      isDefault: false,
    })

    const params: CreateSubscriptionParams = {
      customer,
      price: paidPriceNoTrial,
      product: trialProduct,
      organization,
      quantity: 1,
      livemode: true,
      startDate: new Date(),
      interval: IntervalUnit.Month,
      intervalCount: 1,
      autoStart: true,
      // NO defaultPaymentMethod
      metadata: {},
      name: 'Paid Subscription No Trial',
    }

    const { subscription } = (
      await adminTransaction(async ({ transaction }) => {
        return createSubscriptionWorkflow(
          params,
          createDiscardingEffectsContext(transaction)
        )
      })
    ).unwrap()

    // Verify subscription is NOT trialing (status will be Incomplete without payment method)
    expect(subscription.status).not.toBe(SubscriptionStatus.Trialing)

    // Verify customer notification WAS sent (non-trial paid subscription)
    // Even without payment method, we notify for non-trial subscriptions
    expect(
      idempotentSendCustomerSubscriptionCreatedNotification
    ).toHaveBeenCalledTimes(1)
  })
})
