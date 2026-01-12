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
import { IntervalUnit, PriceType } from '@/types'
import { core } from '@/utils/core'
import type { CreateSubscriptionParams } from './types'
import { createSubscriptionWorkflow } from './workflow'

// Mock the notification function
vi.mock(
  '@/trigger/notifications/send-organization-subscription-created-notification',
  () => ({
    idempotentSendOrganizationSubscriptionCreatedNotification:
      vi.fn(),
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
      await createSubscriptionWorkflow(params, { transaction })
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
      await createSubscriptionWorkflow(params, { transaction })
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
      await createSubscriptionWorkflow(params, { transaction })
    })

    // Verify notification was NOT sent even though slug is not 'free'
    expect(
      idempotentSendOrganizationSubscriptionCreatedNotification
    ).not.toHaveBeenCalled()
  })
})
