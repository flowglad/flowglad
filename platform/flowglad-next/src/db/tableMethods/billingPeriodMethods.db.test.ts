import { beforeEach, describe, expect, it } from 'bun:test'
import {
  setupCustomer,
  setupOrg,
  setupPrice,
  setupSubscription,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { BillingPeriodStatus, CurrencyCode, PriceType } from '@/types'
import { core } from '@/utils/core'
import type { BillingPeriod } from '../schema/billingPeriods'
import type { Customer } from '../schema/customers'
import type { Organization } from '../schema/organizations'
import type { Price } from '../schema/prices'
import type { PricingModel } from '../schema/pricingModels'
import type { Product } from '../schema/products'
import type { Subscription } from '../schema/subscriptions'
import {
  insertBillingPeriod,
  isBillingPeriodInTerminalState,
} from './billingPeriodMethods'

describe('Billing Period Methods', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let subscription: Subscription.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      unitPrice: 1000,
      type: PriceType.SinglePayment,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
    })

    customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test@test.com',
      livemode: true,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      livemode: true,
    })
  })

  describe('insertBillingPeriod', () => {
    it('should successfully insert billing period and derive pricingModelId from subscription', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = Date.now()
        const billingPeriod = await insertBillingPeriod(
          {
            subscriptionId: subscription.id,
            startDate: now,
            endDate: now + 30 * 24 * 60 * 60 * 1000, // 30 days later
            status: BillingPeriodStatus.Active,
            trialPeriod: false,
            proratedPeriod: false,
            livemode: true,
          },
          transaction
        )

        // Verify pricingModelId is correctly derived from subscription
        expect(billingPeriod.pricingModelId).toBe(
          subscription.pricingModelId
        )
        expect(billingPeriod.pricingModelId).toBe(pricingModel.id)
        expect(billingPeriod.subscriptionId).toBe(subscription.id)
      })
    })

    it('should throw an error when subscriptionId does not exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        const nonExistentSubscriptionId = `sub_${core.nanoid()}`
        const now = Date.now()

        await expect(
          insertBillingPeriod(
            {
              subscriptionId: nonExistentSubscriptionId,
              startDate: now,
              endDate: now + 30 * 24 * 60 * 60 * 1000,
              status: BillingPeriodStatus.Active,
              trialPeriod: false,
              proratedPeriod: false,
              livemode: true,
            },
            transaction
          )
        ).rejects.toThrow()
      })
    })

    it('should use provided pricingModelId without derivation', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = Date.now()
        const billingPeriod = await insertBillingPeriod(
          {
            subscriptionId: subscription.id,
            startDate: now,
            endDate: now + 30 * 24 * 60 * 60 * 1000,
            status: BillingPeriodStatus.Active,
            trialPeriod: false,
            proratedPeriod: false,
            livemode: true,
            pricingModelId: pricingModel.id, // explicitly provided
          },
          transaction
        )

        // Verify the provided pricingModelId is used
        expect(billingPeriod.pricingModelId).toBe(pricingModel.id)
      })
    })
  })

  describe('isBillingPeriodInTerminalState', () => {
    const createMockBillingPeriod = (
      status: BillingPeriodStatus
    ): BillingPeriod.Record => ({
      id: 'bp_test',
      subscriptionId: 'sub_test',
      startDate: Date.now(),
      endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      status,
      trialPeriod: false,
      proratedPeriod: false,
      livemode: true,
      pricingModelId: 'pm_test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    it('returns true for Canceled status', () => {
      const billingPeriod = createMockBillingPeriod(
        BillingPeriodStatus.Canceled
      )
      expect(isBillingPeriodInTerminalState(billingPeriod)).toBe(true)
    })

    it('returns true for Completed status', () => {
      const billingPeriod = createMockBillingPeriod(
        BillingPeriodStatus.Completed
      )
      expect(isBillingPeriodInTerminalState(billingPeriod)).toBe(true)
    })

    it('returns false for Active status', () => {
      const billingPeriod = createMockBillingPeriod(
        BillingPeriodStatus.Active
      )
      expect(isBillingPeriodInTerminalState(billingPeriod)).toBe(
        false
      )
    })

    it('returns false for Upcoming status', () => {
      const billingPeriod = createMockBillingPeriod(
        BillingPeriodStatus.Upcoming
      )
      expect(isBillingPeriodInTerminalState(billingPeriod)).toBe(
        false
      )
    })

    it('returns false for ScheduledToCancel status', () => {
      const billingPeriod = createMockBillingPeriod(
        BillingPeriodStatus.ScheduledToCancel
      )
      expect(isBillingPeriodInTerminalState(billingPeriod)).toBe(
        false
      )
    })
  })
})
