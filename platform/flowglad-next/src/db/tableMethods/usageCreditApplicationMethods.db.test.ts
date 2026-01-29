import { beforeEach, describe, expect, it } from 'bun:test'
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
import {
  CurrencyCode,
  PriceType,
  UsageCreditApplicationStatus,
  UsageCreditType,
} from '@/types'
import { core } from '@/utils/core'
import type { Customer } from '../schema/customers'
import type { Organization } from '../schema/organizations'
import type { Price } from '../schema/prices'
import type { PricingModel } from '../schema/pricingModels'
import type { Product } from '../schema/products'
import type { Subscription } from '../schema/subscriptions'
import type { UsageCredit } from '../schema/usageCredits'
import type { UsageMeter } from '../schema/usageMeters'
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
    const orgData = (await setupOrg()).unwrap()
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

    customer = (
      await setupCustomer({
        organizationId: organization.id,
        email: 'test@test.com',
        livemode: true,
      })
    ).unwrap()

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      livemode: true,
    })

    usageMeter = (
      await setupUsageMeter({
        organizationId: organization.id,
        name: 'Test Usage Meter',
        pricingModelId: pricingModel.id,
        livemode: true,
      })
    ).unwrap()

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

    usageCredit = (
      await setupUsageCredit({
        organizationId: organization.id,
        usageMeterId: usageMeter.id,
        subscriptionId: subscription.id,
        creditType: UsageCreditType.Grant,
        livemode: true,
        issuedAmount: 1000,
      })
    ).unwrap()
  })

  describe('insertUsageCreditApplication', () => {
    it('should successfully insert usage credit application and derive pricingModelId from usage credit', async () => {
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
      })
    })

    it('should throw an error when usageCreditId does not exist', async () => {
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
        const nonExistentUsageCreditId = `uc_${core.nanoid()}`

        await expect(
          insertUsageCreditApplication(
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
        ).rejects.toThrow()
      })
    })

    it('should use provided pricingModelId without derivation', async () => {
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
      })
    })
  })

  describe('bulkInsertUsageCreditApplications', () => {
    let usageCredit2: UsageCredit.Record

    beforeEach(async () => {
      // Create a second usage credit for bulk operations
      usageCredit2 = (
        await setupUsageCredit({
          organizationId: organization.id,
          usageMeterId: usageMeter.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          livemode: true,
          issuedAmount: 2000,
        })
      ).unwrap()
    })

    it('should bulk insert usage credit applications and derive pricingModelId for each', async () => {
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
      })
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

      const usageCreditApplication = (
        await setupUsageCreditApplication({
          organizationId: organization.id,
          usageCreditId: usageCredit.id,
          usageEventId: usageEvent.id,
          amountApplied: 100,
          livemode: true,
        })
      ).unwrap()

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
