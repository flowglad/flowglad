import { beforeEach, describe, expect, it } from 'bun:test'
import {
  IntervalUnit,
  PriceType,
  SubscriptionStatus,
} from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { Price } from '@db-core/schema/prices'
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
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import { CancellationReason } from '@/types'
import { core } from '@/utils/core'
import { verifyCanCreateSubscription } from './helpers'
import type { CreateSubscriptionParams } from './types'

describe('Single Free Subscription Constraint', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let freePrice: Price.Record
  let paidPrice: Price.Record

  beforeEach(async () => {
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
    const freeProduct = await setupProduct({
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
    const paidProduct = await setupProduct({
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

  describe('verifyCanCreateSubscription', () => {
    it('should prevent creating a second free subscription when one already exists', async () => {
      // Create first free subscription
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        livemode: true,
        isFreePlan: true,
      })

      // Try to create second free subscription
      const params: CreateSubscriptionParams = {
        customer,
        price: freePrice,
        product: { id: 'prod_1', name: 'Free Plan' } as any,
        organization,
        quantity: 1,
        livemode: true,
        startDate: new Date(),
        interval: IntervalUnit.Month,
        intervalCount: 1,
        autoStart: true,
        discountRedemption: null,
        metadata: {},
        name: 'Second Free Sub',
      }(
        await adminTransactionWithResult(async ({ transaction }) => {
          const result = await verifyCanCreateSubscription(
            params,
            transaction
          )
          expect(Result.isError(result)).toBe(true)
          if (Result.isError(result)) {
            expect(result.error.message).toMatch(
              /already has an active free subscription.*Only one free subscription is allowed per customer/
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should allow creating a paid subscription when a free subscription exists', async () => {
      // Create free subscription
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Active,
        livemode: true,
        isFreePlan: true,
      })

      // Create payment method
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
        stripePaymentMethodId: `pm_${core.nanoid()}`,
        livemode: true,
      })

      // Try to create paid subscription (should succeed)
      const params: CreateSubscriptionParams = {
        customer,
        price: paidPrice,
        product: { id: 'prod_2', name: 'Pro Plan' } as any,
        organization,
        quantity: 1,
        livemode: true,
        startDate: new Date(),
        interval: IntervalUnit.Month,
        intervalCount: 1,
        autoStart: true,
        defaultPaymentMethod: paymentMethod,
        discountRedemption: null,
        metadata: {},
        name: 'Paid Sub',
      }(
        await adminTransactionWithResult(async ({ transaction }) => {
          // Update organization to allow multiple subscriptions
          await updateOrganization(
            {
              id: organization.id,
              allowMultipleSubscriptionsPerCustomer: true,
            },
            transaction
          )

          // This should succeed
          const result = await verifyCanCreateSubscription(
            params,
            transaction
          )
          expect(Result.isOk(result)).toBe(true)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should allow creating a free subscription when no active free subscription exists', async () => {
      // Create canceled free subscription
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: freePrice.id,
        status: SubscriptionStatus.Canceled,
        livemode: true,
        isFreePlan: true,
        canceledAt: Date.now(),
        cancellationReason: CancellationReason.CustomerRequest,
      })

      // Try to create new free subscription (should succeed)
      const params: CreateSubscriptionParams = {
        customer,
        price: freePrice,
        product: { id: 'prod_1', name: 'Free Plan' } as any,
        organization,
        quantity: 1,
        livemode: true,
        startDate: new Date(),
        interval: IntervalUnit.Month,
        intervalCount: 1,
        autoStart: true,
        discountRedemption: null,
        metadata: {},
        name: 'New Free Sub',
      }(
        await adminTransactionWithResult(async ({ transaction }) => {
          // This should succeed
          const result = await verifyCanCreateSubscription(
            params,
            transaction
          )
          expect(Result.isOk(result)).toBe(true)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should allow multiple paid subscriptions when organization allows it', async () => {
      // Update organization to allow multiple subscriptions
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updateOrganization(
            {
              id: organization.id,
              allowMultipleSubscriptionsPerCustomer: true,
            },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      // Create first paid subscription
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
        stripePaymentMethodId: `pm_${core.nanoid()}`,
        livemode: true,
      })

      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: paidPrice.id,
        status: SubscriptionStatus.Active,
        livemode: true,
        isFreePlan: false,
        defaultPaymentMethodId: paymentMethod.id,
      })

      // Try to create second paid subscription (should succeed)
      const params: CreateSubscriptionParams = {
        customer,
        price: paidPrice,
        product: { id: 'prod_2', name: 'Pro Plan' } as any,
        organization,
        quantity: 1,
        livemode: true,
        startDate: new Date(),
        interval: IntervalUnit.Month,
        intervalCount: 1,
        autoStart: true,
        defaultPaymentMethod: paymentMethod,
        discountRedemption: null,
        metadata: {},
        name: 'Second Paid Sub',
      }(
        await adminTransactionWithResult(async ({ transaction }) => {
          // This should succeed
          const result = await verifyCanCreateSubscription(
            params,
            transaction
          )
          expect(Result.isOk(result)).toBe(true)
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })
})
