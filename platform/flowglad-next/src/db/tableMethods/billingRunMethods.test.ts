import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  setupBillingPeriod,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupSubscription,
  teardownOrg,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { Subscription } from '@/db/schema/subscriptions'
import { BillingRunStatus, SubscriptionStatus } from '@/types'
import { core } from '@/utils/core'
import {
  safelyInsertBillingRun,
  selectBillingRunsDueForExecution,
} from './billingRunMethods'
import { safelyUpdateSubscriptionStatus } from './subscriptionMethods'

describe('billingRunMethods', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let billingPeriod: BillingPeriod.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product
    price = orgData.price

    customer = await setupCustomer({
      organizationId: organization.id,
    })

    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
    })

    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: Date.now(),
      endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
    })
  })

  afterEach(async () => {
    if (organization) {
      await teardownOrg({ organizationId: organization.id })
    }
  })

  describe('safelyInsertBillingRun', () => {
    it('should successfully create a billing run for a valid active subscription', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return safelyInsertBillingRun(
            {
              billingPeriodId: billingPeriod.id,
              scheduledFor: Date.now(),
              status: BillingRunStatus.Scheduled,
              subscriptionId: subscription.id,
              paymentMethodId: paymentMethod.id,
              livemode: billingPeriod.livemode,
            },
            transaction
          )
        }
      )

      expect(result.subscriptionId).toBe(subscription.id)
      expect(result.billingPeriodId).toBe(billingPeriod.id)
      expect(result.paymentMethodId).toBe(paymentMethod.id)
      expect(result.status).toBe(BillingRunStatus.Scheduled)
    })

    it('should throw error when subscription is canceled', async () => {
      // Cancel the subscription
      await adminTransaction(async ({ transaction }) => {
        await safelyUpdateSubscriptionStatus(
          subscription,
          SubscriptionStatus.Canceled,
          transaction
        )
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return safelyInsertBillingRun(
            {
              billingPeriodId: billingPeriod.id,
              scheduledFor: Date.now(),
              status: BillingRunStatus.Scheduled,
              subscriptionId: subscription.id,
              paymentMethodId: paymentMethod.id,
              livemode: billingPeriod.livemode,
            },
            transaction
          )
        })
      ).rejects.toThrow(
        'Cannot create billing run for canceled subscription'
      )
    })

    it('should throw error when subscription has doNotCharge set to true', async () => {
      // Create a doNotCharge subscription
      const doNotChargeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        status: SubscriptionStatus.Active,
        doNotCharge: true,
      })

      const doNotChargeBillingPeriod = await setupBillingPeriod({
        subscriptionId: doNotChargeSubscription.id,
        startDate: Date.now(),
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      })

      await expect(
        adminTransaction(async ({ transaction }) => {
          return safelyInsertBillingRun(
            {
              billingPeriodId: doNotChargeBillingPeriod.id,
              scheduledFor: Date.now(),
              status: BillingRunStatus.Scheduled,
              subscriptionId: doNotChargeSubscription.id,
              paymentMethodId: paymentMethod.id,
              livemode: doNotChargeBillingPeriod.livemode,
            },
            transaction
          )
        })
      ).rejects.toThrow(
        'Cannot create billing run for doNotCharge subscription'
      )
    })
  })

  describe('selectBillingRunsDueForExecution', () => {
    it('should filter by livemode=false correctly', async () => {
      // Create testmode billing run (should be returned when querying for livemode: false)
      const testmodeBillingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: Date.now(),
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        livemode: false,
      })

      const testmodeBillingRun = await adminTransaction(
        async ({ transaction }) => {
          return safelyInsertBillingRun(
            {
              billingPeriodId: testmodeBillingPeriod.id,
              scheduledFor: Date.now() - 1000,
              status: BillingRunStatus.Scheduled,
              subscriptionId: subscription.id,
              paymentMethodId: paymentMethod.id,
              livemode: false,
            },
            transaction
          )
        }
      )

      // Create livemode billing run (should NOT be returned when querying for livemode: false)
      const livemodeBillingRun = await adminTransaction(
        async ({ transaction }) => {
          return safelyInsertBillingRun(
            {
              billingPeriodId: billingPeriod.id,
              scheduledFor: Date.now() - 1000,
              status: BillingRunStatus.Scheduled,
              subscriptionId: subscription.id,
              paymentMethodId: paymentMethod.id,
              livemode: true,
            },
            transaction
          )
        }
      )

      // Query for testmode runs (inverse case - livemode: true is covered in test 4)
      const testmodeResults = await adminTransaction(
        async ({ transaction }) => {
          return selectBillingRunsDueForExecution(
            { livemode: false },
            transaction
          )
        }
      )

      // Verify testmode results contain matching run and not livemode run
      expect(
        testmodeResults.some((br) => br.id === testmodeBillingRun.id)
      ).toBe(true)
      expect(
        testmodeResults.some((br) => br.id === livemodeBillingRun.id)
      ).toBe(false)
      expect(
        testmodeResults.find((br) => br.id === testmodeBillingRun.id)
          ?.livemode
      ).toBe(false)
    })

    it('should combine all filters correctly (status, scheduledFor, livemode)', async () => {
      const now = Date.now()

      // Create a billing run that matches all criteria
      const matchingBillingRun = await adminTransaction(
        async ({ transaction }) => {
          return safelyInsertBillingRun(
            {
              billingPeriodId: billingPeriod.id,
              scheduledFor: now - 1000,
              status: BillingRunStatus.Scheduled,
              subscriptionId: subscription.id,
              paymentMethodId: paymentMethod.id,
              livemode: true,
            },
            transaction
          )
        }
      )

      // Create billing runs that don't match one or more criteria
      // 1. Wrong status
      const nonMatchingStatusRun = await adminTransaction(
        async ({ transaction }) => {
          return safelyInsertBillingRun(
            {
              billingPeriodId: billingPeriod.id,
              scheduledFor: now - 1000,
              status: BillingRunStatus.Failed,
              subscriptionId: subscription.id,
              paymentMethodId: paymentMethod.id,
              livemode: true,
            },
            transaction
          )
        }
      )

      // 2. Future scheduledFor
      const nonMatchingTimeRun = await adminTransaction(
        async ({ transaction }) => {
          return safelyInsertBillingRun(
            {
              billingPeriodId: billingPeriod.id,
              scheduledFor: now + 1000,
              status: BillingRunStatus.Scheduled,
              subscriptionId: subscription.id,
              paymentMethodId: paymentMethod.id,
              livemode: true,
            },
            transaction
          )
        }
      )

      // 3. Wrong livemode
      const testmodeBillingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: Date.now(),
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        livemode: false,
      })

      const nonMatchingLivemodeRun = await adminTransaction(
        async ({ transaction }) => {
          return safelyInsertBillingRun(
            {
              billingPeriodId: testmodeBillingPeriod.id,
              scheduledFor: now - 1000,
              status: BillingRunStatus.Scheduled,
              subscriptionId: subscription.id,
              paymentMethodId: paymentMethod.id,
              livemode: false,
            },
            transaction
          )
        }
      )

      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectBillingRunsDueForExecution(
            { livemode: true },
            transaction
          )
        }
      )

      // Verify matching billing run is in results
      expect(
        result.some((br) => br.id === matchingBillingRun.id)
      ).toBe(true)
      // Verify all non-matching billing runs are NOT in results
      expect(
        result.some((br) => br.id === nonMatchingStatusRun.id)
      ).toBe(false)
      expect(
        result.some((br) => br.id === nonMatchingTimeRun.id)
      ).toBe(false)
      expect(
        result.some((br) => br.id === nonMatchingLivemodeRun.id)
      ).toBe(false)

      const foundRun = result.find(
        (br) => br.id === matchingBillingRun.id
      )
      expect(foundRun?.status).toBe(BillingRunStatus.Scheduled)
      expect(foundRun?.scheduledFor).toBeLessThan(now)
      expect(foundRun?.livemode).toBe(true)
    })
  })

  describe('pricingModelId derivation', () => {
    it('should derive pricingModelId from subscription when creating billing run', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return safelyInsertBillingRun(
            {
              billingPeriodId: billingPeriod.id,
              scheduledFor: Date.now(),
              status: BillingRunStatus.Scheduled,
              subscriptionId: subscription.id,
              paymentMethodId: paymentMethod.id,
              livemode: billingPeriod.livemode,
            },
            transaction
          )
        }
      )

      expect(result.pricingModelId).toBe(subscription.pricingModelId)
      expect(result.pricingModelId).toBe(pricingModel.id)
    })

    it('should honor provided pricingModelId', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return safelyInsertBillingRun(
            {
              billingPeriodId: billingPeriod.id,
              scheduledFor: Date.now(),
              status: BillingRunStatus.Scheduled,
              subscriptionId: subscription.id,
              paymentMethodId: paymentMethod.id,
              livemode: billingPeriod.livemode,
              pricingModelId: pricingModel.id, // explicitly provided
            },
            transaction
          )
        }
      )

      expect(result.pricingModelId).toBe(pricingModel.id)
    })

    it('should throw error when subscription does not exist during pricingModelId derivation', async () => {
      const nonExistentSubscriptionId = `sub_${core.nanoid()}`
      await expect(
        adminTransaction(async ({ transaction }) => {
          return safelyInsertBillingRun(
            {
              billingPeriodId: billingPeriod.id,
              scheduledFor: Date.now(),
              status: BillingRunStatus.Scheduled,
              subscriptionId: nonExistentSubscriptionId,
              paymentMethodId: paymentMethod.id,
              livemode: billingPeriod.livemode,
            },
            transaction
          )
        })
      ).rejects.toThrow()
    })
  })
})
