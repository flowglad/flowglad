import { beforeEach, describe, expect, it } from 'bun:test'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupOrg,
  setupPrice,
  setupSubscription,
  setupUsageCredit,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  CurrencyCode,
  PriceType,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
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
  bulkInsertUsageCredits,
  derivePricingModelIdFromUsageCredit,
  insertUsageCredit,
  pricingModelIdsForUsageCredits,
} from './usageCreditMethods'

describe('Usage Credit Methods', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let subscription: Subscription.Record
  let usageMeter: UsageMeter.Record

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
  })

  describe('insertUsageCredit', () => {
    it('should successfully insert usage credit and derive pricingModelId from usage meter', async () => {
      const usageCredit = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await insertUsageCredit(
              {
                organizationId: organization.id,
                usageMeterId: usageMeter.id,
                subscriptionId: subscription.id,
                creditType: UsageCreditType.Grant,
                livemode: true,
                issuedAmount: 1000,
                issuedAt: Date.now(),
                status: UsageCreditStatus.Posted,
                sourceReferenceId: `src_ref_${core.nanoid()}`,
                sourceReferenceType:
                  UsageCreditSourceReferenceType.InvoiceSettlement,
                notes: 'Test usage credit',
                metadata: {},
                paymentId: null,
              },
              transaction
            )
          )
        })
      ).unwrap()

      // Verify pricingModelId is correctly derived from usage meter
      expect(usageCredit.pricingModelId).toBe(
        usageMeter.pricingModelId
      )
      expect(usageCredit.pricingModelId).toBe(pricingModel.id)
    })

    it('should throw an error when usageMeterId does not exist', async () => {
      const nonExistentUsageMeterId = `um_${core.nanoid()}`

      const result = await adminTransaction(
        async ({ transaction }) => {
          await insertUsageCredit(
            {
              organizationId: organization.id,
              usageMeterId: nonExistentUsageMeterId,
              subscriptionId: subscription.id,
              creditType: UsageCreditType.Grant,
              livemode: true,
              issuedAmount: 1000,
              issuedAt: Date.now(),
              status: UsageCreditStatus.Posted,
              sourceReferenceId: `src_ref_${core.nanoid()}`,
              sourceReferenceType:
                UsageCreditSourceReferenceType.InvoiceSettlement,
              notes: 'Test usage credit',
              metadata: {},
              paymentId: null,
            },
            transaction
          )
          return Result.ok(undefined)
        }
      )
      expect(Result.isError(result)).toBe(true)
    })

    it('should use provided pricingModelId without derivation', async () => {
      const usageCredit = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await insertUsageCredit(
              {
                organizationId: organization.id,
                usageMeterId: usageMeter.id,
                subscriptionId: subscription.id,
                creditType: UsageCreditType.Grant,
                livemode: true,
                issuedAmount: 1000,
                issuedAt: Date.now(),
                status: UsageCreditStatus.Posted,
                sourceReferenceId: `src_ref_${core.nanoid()}`,
                sourceReferenceType:
                  UsageCreditSourceReferenceType.InvoiceSettlement,
                notes: 'Test usage credit',
                metadata: {},
                paymentId: null,
                pricingModelId: pricingModel.id, // explicitly provided
              },
              transaction
            )
          )
        })
      ).unwrap()

      // Verify the provided pricingModelId is used
      expect(usageCredit.pricingModelId).toBe(pricingModel.id)
    })
  })

  describe('derivePricingModelIdFromUsageCredit', () => {
    it('should successfully derive pricingModelId from usage credit', async () => {
      const usageCredit = (
        await setupUsageCredit({
          organizationId: organization.id,
          usageMeterId: usageMeter.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          livemode: true,
          issuedAmount: 1000,
        })
      ).unwrap()

      const derivedPricingModelId = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await derivePricingModelIdFromUsageCredit(
              usageCredit.id,
              transaction
            )
          )
        })
      ).unwrap()

      expect(derivedPricingModelId).toBe(usageCredit.pricingModelId)
      expect(derivedPricingModelId).toBe(pricingModel.id)
    })

    it('should throw an error when usage credit does not exist', async () => {
      const nonExistentUsageCreditId = `uc_${core.nanoid()}`

      const result = await adminTransaction(
        async ({ transaction }) => {
          await derivePricingModelIdFromUsageCredit(
            nonExistentUsageCreditId,
            transaction
          )
          return Result.ok(undefined)
        }
      )
      expect(Result.isError(result)).toBe(true)
    })
  })

  describe('pricingModelIdsForUsageCredits', () => {
    it('should successfully return map of pricingModelIds for multiple usage credits', async () => {
      const usageCredit1 = (
        await setupUsageCredit({
          organizationId: organization.id,
          usageMeterId: usageMeter.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          livemode: true,
          issuedAmount: 1000,
        })
      ).unwrap()

      const usageCredit2 = (
        await setupUsageCredit({
          organizationId: organization.id,
          usageMeterId: usageMeter.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          livemode: true,
          issuedAmount: 2000,
        })
      ).unwrap()

      const pricingModelIdMap = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await pricingModelIdsForUsageCredits(
              [usageCredit1.id, usageCredit2.id],
              transaction
            )
          )
        })
      ).unwrap()

      expect(pricingModelIdMap.size).toBe(2)
      expect(pricingModelIdMap.get(usageCredit1.id)).toBe(
        pricingModel.id
      )
      expect(pricingModelIdMap.get(usageCredit2.id)).toBe(
        pricingModel.id
      )
    })

    it('should return empty map when no usage credit IDs are provided', async () => {
      const pricingModelIdMap = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await pricingModelIdsForUsageCredits([], transaction)
          )
        })
      ).unwrap()

      expect(pricingModelIdMap.size).toBe(0)
    })

    it('should only return entries for existing usage credits', async () => {
      const usageCredit = (
        await setupUsageCredit({
          organizationId: organization.id,
          usageMeterId: usageMeter.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          livemode: true,
          issuedAmount: 1000,
        })
      ).unwrap()

      const nonExistentUsageCreditId = `uc_${core.nanoid()}`
      const pricingModelIdMap = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await pricingModelIdsForUsageCredits(
              [usageCredit.id, nonExistentUsageCreditId],
              transaction
            )
          )
        })
      ).unwrap()

      expect(pricingModelIdMap.size).toBe(1)
      expect(pricingModelIdMap.get(usageCredit.id)).toBe(
        pricingModel.id
      )
      expect(pricingModelIdMap.has(nonExistentUsageCreditId)).toBe(
        false
      )
    })
  })

  describe('bulkInsertUsageCredits', () => {
    it('should bulk insert usage credits and derive pricingModelId for each', async () => {
      const usageCredits = (
        await adminTransaction(async ({ transaction }) => {
          const innerResult = await bulkInsertUsageCredits(
            [
              {
                organizationId: organization.id,
                usageMeterId: usageMeter.id,
                subscriptionId: subscription.id,
                creditType: UsageCreditType.Grant,
                livemode: true,
                issuedAmount: 1000,
                issuedAt: Date.now(),
                status: UsageCreditStatus.Posted,
                sourceReferenceId: `src_ref_${core.nanoid()}`,
                sourceReferenceType:
                  UsageCreditSourceReferenceType.InvoiceSettlement,
                notes: 'Test usage credit 1',
                metadata: {},
                paymentId: null,
              },
              {
                organizationId: organization.id,
                usageMeterId: usageMeter.id,
                subscriptionId: subscription.id,
                creditType: UsageCreditType.Grant,
                livemode: true,
                issuedAmount: 2000,
                issuedAt: Date.now(),
                status: UsageCreditStatus.Posted,
                sourceReferenceId: `src_ref_${core.nanoid()}`,
                sourceReferenceType:
                  UsageCreditSourceReferenceType.InvoiceSettlement,
                notes: 'Test usage credit 2',
                metadata: {},
                paymentId: null,
              },
            ],
            transaction
          )
          if (Result.isError(innerResult)) {
            throw innerResult.error
          }
          return Result.ok(innerResult.value)
        })
      ).unwrap()

      expect(usageCredits).toHaveLength(2)

      // Verify pricingModelId is correctly derived for each usage credit
      expect(usageCredits[0]!.pricingModelId).toBe(
        usageMeter.pricingModelId
      )
      expect(usageCredits[0]!.pricingModelId).toBe(pricingModel.id)

      expect(usageCredits[1]!.pricingModelId).toBe(
        usageMeter.pricingModelId
      )
      expect(usageCredits[1]!.pricingModelId).toBe(pricingModel.id)
    })
  })

  describe('setupUsageCredit', () => {
    it('should create usage credit via setupUsageCredit and verify pricingModelId', async () => {
      const usageCredit = (
        await setupUsageCredit({
          organizationId: organization.id,
          usageMeterId: usageMeter.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          livemode: true,
          issuedAmount: 1000,
        })
      ).unwrap()

      // Verify pricingModelId is correctly derived from usage meter
      expect(usageCredit.pricingModelId).toBe(
        usageMeter.pricingModelId
      )
      expect(usageCredit.pricingModelId).toBe(pricingModel.id)
    })
  })
})
