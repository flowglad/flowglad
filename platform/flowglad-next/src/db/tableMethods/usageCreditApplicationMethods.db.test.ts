import { beforeEach, describe, expect, it } from 'bun:test'
import {
  CurrencyCode,
  PriceType,
  UsageCreditApplicationStatus,
  UsageCreditType,
} from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { Price } from '@db-core/schema/prices'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { Product } from '@db-core/schema/products'
import type { Subscription } from '@db-core/schema/subscriptions'
import type { UsageCredit } from '@db-core/schema/usageCredits'
import type { UsageMeter } from '@db-core/schema/usageMeters'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupOrg,
  setupPrice,
  setupSubscription,
  setupUsageCredit,
  setupUsageCreditApplication,
  setupUsageEvent,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { core } from '@/utils/core'
import {
  bulkInsertUsageCreditApplications,
  insertUsageCreditApplication,
} from './usageCreditApplicationMethods'

describe('Usage Credit Application Methods', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let usagePrice: Price.Record
  let customer: Customer.Record
  let subscription: Subscription.Record
  let usageMeter: UsageMeter.Record
  let usageCredit: UsageCredit.Record

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

    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter',
      pricingModelId: pricingModel.id,
      livemode: true,
    })

    // Create a usage price for the usage meter (required for usage events)
    usagePrice = await setupPrice({
      name: 'Test Usage Price',
      unitPrice: 100,
      type: PriceType.Usage,
      livemode: true,
      isDefault: true,
      currency: CurrencyCode.USD,
      usageMeterId: usageMeter.id,
    })

    usageCredit = await setupUsageCredit({
      organizationId: organization.id,
      usageMeterId: usageMeter.id,
      subscriptionId: subscription.id,
      creditType: UsageCreditType.Grant,
      livemode: true,
      issuedAmount: 1000,
    })
  })

  describe('insertUsageCreditApplication', () => {
    it('should successfully insert usage credit application and derive pricingModelId from usage credit', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Create a usage event first
          const usageEvent = await setupUsageEvent({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            customerId: customer.id,
            priceId: usagePrice.id,
            transactionId: `txn_${core.nanoid()}`,
            amount: 100,
            livemode: true,
          })

          const usageCreditApplication =
            await insertUsageCreditApplication(
              {
                organizationId: organization.id,
                usageCreditId: usageCredit.id,
                usageEventId: usageEvent.id,
                amountApplied: 100,
                appliedAt: Date.now(),
                livemode: true,
                status: UsageCreditApplicationStatus.Posted,
              },
              transaction
            )

          // Verify pricingModelId is correctly derived from usage credit
          expect(usageCreditApplication.pricingModelId).toBe(
            usageCredit.pricingModelId
          )
          expect(usageCreditApplication.pricingModelId).toBe(
            usageMeter.pricingModelId
          )
          expect(usageCreditApplication.pricingModelId).toBe(
            pricingModel.id
          )
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should return an error when usageCreditId does not exist', async () => {
      const usageEvent = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        customerId: customer.id,
        priceId: usagePrice.id,
        transactionId: `txn_${core.nanoid()}`,
        amount: 100,
        livemode: true,
      })
      const nonExistentUsageCreditId = `uc_${core.nanoid()}`

      const result = await adminTransaction(
        async ({ transaction }) => {
          try {
            await insertUsageCreditApplication(
              {
                organizationId: organization.id,
                usageCreditId: nonExistentUsageCreditId,
                usageEventId: usageEvent.id,
                amountApplied: 100,
                appliedAt: Date.now(),
                livemode: true,
                status: UsageCreditApplicationStatus.Posted,
              },
              transaction
            )
            return Result.ok('no-error' as const)
          } catch (error) {
            return Result.err(error as Error)
          }
        }
      )
      expect(Result.isError(result)).toBe(true)
    })

    it('should use provided pricingModelId without derivation', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          const usageEvent = await setupUsageEvent({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            customerId: customer.id,
            priceId: usagePrice.id,
            transactionId: `txn_${core.nanoid()}`,
            amount: 100,
            livemode: true,
          })

          const usageCreditApplication =
            await insertUsageCreditApplication(
              {
                organizationId: organization.id,
                usageCreditId: usageCredit.id,
                usageEventId: usageEvent.id,
                amountApplied: 100,
                appliedAt: Date.now(),
                livemode: true,
                status: UsageCreditApplicationStatus.Posted,
                pricingModelId: pricingModel.id, // explicitly provided
              },
              transaction
            )

          // Verify the provided pricingModelId is used
          expect(usageCreditApplication.pricingModelId).toBe(
            pricingModel.id
          )
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  describe('bulkInsertUsageCreditApplications', () => {
    let usageCredit2: UsageCredit.Record

    beforeEach(async () => {
      // Create a second usage credit for bulk operations
      usageCredit2 = await setupUsageCredit({
        organizationId: organization.id,
        usageMeterId: usageMeter.id,
        subscriptionId: subscription.id,
        creditType: UsageCreditType.Grant,
        livemode: true,
        issuedAmount: 2000,
      })
    })

    it('should bulk insert usage credit applications and derive pricingModelId for each', async () => {
      ;(
        await adminTransaction(async ({ transaction }) => {
          // Create usage events first
          const usageEvent1 = await setupUsageEvent({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            customerId: customer.id,
            priceId: usagePrice.id,
            transactionId: `txn_${core.nanoid()}`,
            amount: 100,
            livemode: true,
          })

          const usageEvent2 = await setupUsageEvent({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            customerId: customer.id,
            priceId: usagePrice.id,
            transactionId: `txn_${core.nanoid()}`,
            amount: 200,
            livemode: true,
          })

          const usageCreditApplications =
            await bulkInsertUsageCreditApplications(
              [
                {
                  organizationId: organization.id,
                  usageCreditId: usageCredit.id,
                  usageEventId: usageEvent1.id,
                  amountApplied: 100,
                  appliedAt: Date.now(),
                  livemode: true,
                  status: UsageCreditApplicationStatus.Posted,
                },
                {
                  organizationId: organization.id,
                  usageCreditId: usageCredit2.id,
                  usageEventId: usageEvent2.id,
                  amountApplied: 200,
                  appliedAt: Date.now(),
                  livemode: true,
                  status: UsageCreditApplicationStatus.Posted,
                },
              ],
              transaction
            )

          expect(usageCreditApplications).toHaveLength(2)

          // Verify pricingModelId is correctly derived for each application
          expect(usageCreditApplications[0]!.pricingModelId).toBe(
            usageCredit.pricingModelId
          )
          expect(usageCreditApplications[0]!.pricingModelId).toBe(
            pricingModel.id
          )

          expect(usageCreditApplications[1]!.pricingModelId).toBe(
            usageCredit2.pricingModelId
          )
          expect(usageCreditApplications[1]!.pricingModelId).toBe(
            pricingModel.id
          )
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  describe('setupUsageCreditApplication', () => {
    it('should create usage credit application via setupUsageCreditApplication and verify pricingModelId', async () => {
      // Create a usage event first
      const usageEvent = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        customerId: customer.id,
        priceId: usagePrice.id,
        transactionId: `txn_${core.nanoid()}`,
        amount: 100,
        livemode: true,
      })

      const usageCreditApplication =
        await setupUsageCreditApplication({
          organizationId: organization.id,
          usageCreditId: usageCredit.id,
          usageEventId: usageEvent.id,
          amountApplied: 100,
          livemode: true,
        })

      // Verify pricingModelId is correctly derived from usage credit
      expect(usageCreditApplication.pricingModelId).toBe(
        usageCredit.pricingModelId
      )
      expect(usageCreditApplication.pricingModelId).toBe(
        usageMeter.pricingModelId
      )
      expect(usageCreditApplication.pricingModelId).toBe(
        pricingModel.id
      )
    })
  })
})
