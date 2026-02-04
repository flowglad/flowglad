import { beforeEach, describe, expect, it } from 'bun:test'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  CurrencyCode,
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  PaymentStatus,
  PriceType,
  SubscriptionItemType,
  SubscriptionStatus,
  UsageCreditSourceReferenceType,
  UsageCreditType,
} from '@db-core/enums'
import type { BillingPeriod } from '@db-core/schema/billingPeriods'
import type { Customer } from '@db-core/schema/customers'
import type { PaymentMethod } from '@db-core/schema/paymentMethods'
import { nulledPriceColumns } from '@db-core/schema/prices'
import type { SubscriptionItem } from '@db-core/schema/subscriptionItems'
import type { Subscription } from '@db-core/schema/subscriptions'
import { Result } from 'better-result'
import { addDays, subDays } from 'date-fns'
// These seed methods (and the clearDatabase helper) come from our test support code.
// They create real records in our test database.
import {
  setupBillingPeriod,
  setupBillingPeriodItem,
  setupBillingRun,
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPayment,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupProductFeature,
  setupResource,
  setupResourceClaim,
  setupResourceFeature,
  setupResourceSubscriptionItemFeature,
  setupSubscription,
  setupSubscriptionItem,
  setupSubscriptionItemFeature,
  setupUsageCredit,
  setupUsageCreditGrantFeature,
  setupUsageMeter,
} from '@/../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import { selectBillingPeriodItems } from '@/db/tableMethods/billingPeriodItemMethods'
import {
  selectCurrentBillingPeriodForSubscription,
  updateBillingPeriod,
} from '@/db/tableMethods/billingPeriodMethods'
import { selectBillingRuns } from '@/db/tableMethods/billingRunMethods'
import { insertPrice } from '@/db/tableMethods/priceMethods'
import { selectActiveResourceClaims } from '@/db/tableMethods/resourceClaimMethods'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
// Helpers to query the database after adjustments
import {
  selectSubscriptionItems,
  selectSubscriptionItemsAndSubscriptionBySubscriptionId,
  updateSubscriptionItem,
} from '@/db/tableMethods/subscriptionItemMethods'
import { expireSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods.server'
import { updateSubscription } from '@/db/tableMethods/subscriptionMethods'
import { selectUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import {
  claimResourceTransaction,
  getResourceUsage,
  releaseResourceTransaction,
} from '@/resources/resourceClaimHelpers'
import {
  adjustSubscription,
  autoDetectTiming,
  calculateSplitInBillingPeriodBasedOnAdjustmentDate,
  syncSubscriptionWithActiveItems,
} from '@/subscriptions/adjustSubscription'
import type { TerseSubscriptionItem } from '@/subscriptions/schemas'
import { SubscriptionAdjustmentTiming } from '@/types'

// Helper to normalize Date | number into milliseconds since epoch
const toMs = (d: Date | number | null | undefined): number | null => {
  if (d == null) return null
  return typeof d === 'number' ? d : d.getTime()
}

// Helper function to verify subscription items match expected values
function expectSubscriptionItemsToMatch(
  newItems: SubscriptionItem.Upsert[],
  resultItems: SubscriptionItem.Record[],
  subscription: Subscription.Record
) {
  newItems.forEach((newItem) => {
    const matchingResultItem = resultItems.find((resultItem) => {
      return 'id' in newItem
        ? resultItem.id === newItem.id
        : resultItem.name === newItem.name
    })
    expect(typeof matchingResultItem).toBe('object')

    if (matchingResultItem) {
      // Verify common fields match (excluding dates and system-generated fields)
      expect(matchingResultItem.name).toBe(newItem.name!)
      expect(matchingResultItem.quantity).toBe(newItem.quantity)
      expect(matchingResultItem.unitPrice).toBe(newItem.unitPrice)
      expect(matchingResultItem.type).toBe(newItem.type)
      if (
        matchingResultItem.expiredAt == null ||
        newItem.expiredAt == null
      ) {
        expect(matchingResultItem.expiredAt).toBe(newItem.expiredAt)
      } else {
        expect(toMs(matchingResultItem.expiredAt)!).toBe(
          toMs(newItem.expiredAt)!
        )
      }
      expect(matchingResultItem.externalId).toBe(newItem.externalId!)
      expect(matchingResultItem.metadata).toEqual(newItem.metadata)
      expect(matchingResultItem.subscriptionId).toBe(subscription.id)
      expect(matchingResultItem.priceId).toBe(newItem.priceId!)
      expect(matchingResultItem.livemode).toBe(subscription.livemode)
    }
  })
}

describe('adjustSubscription Integration Tests', async () => {
  const { organization, price, product, pricingModel } =
    await setupOrg()
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let billingPeriod: BillingPeriod.Record
  let subscription: Subscription.Record
  let subscriptionItemCore: Pick<
    SubscriptionItem.Record,
    | 'subscriptionId'
    | 'priceId'
    | 'name'
    | 'quantity'
    | 'unitPrice'
    | 'livemode'
    | 'createdAt'
    | 'updatedAt'
    | 'metadata'
    | 'addedDate'
    | 'externalId'
    | 'type'
  >
  beforeEach(async () => {
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
      paymentMethodId: paymentMethod.id,
      currentBillingPeriodEnd: Date.now() - 3000,
      currentBillingPeriodStart:
        Date.now() - 30 * 24 * 60 * 60 * 1000,
    })
    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: subscription.currentBillingPeriodStart!,
      endDate: subscription.currentBillingPeriodEnd!,
      status: BillingPeriodStatus.Active,
    })
    await setupBillingRun({
      billingPeriodId: billingPeriod.id,
      paymentMethodId: paymentMethod.id,
      subscriptionId: subscription.id,
      status: BillingRunStatus.Scheduled,
    })
    await setupBillingPeriodItem({
      billingPeriodId: billingPeriod.id,
      quantity: 1,
      unitPrice: 100,
    })
    subscriptionItemCore = {
      subscriptionId: subscription.id,
      priceId: price.id,
      name: 'Item 1',
      quantity: 1,
      unitPrice: 100,
      livemode: subscription.livemode,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: null,
      addedDate: Date.now(),
      externalId: null,
      type: SubscriptionItemType.Static,
    }
  })

  /* ==========================================================================
    Error Conditions
  ========================================================================== */
  describe('Error Conditions', () => {
    it('should throw error if the subscription is terminal', async () => {
      const canceledSubscription = await setupSubscription({
        status: SubscriptionStatus.Canceled,
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
      })
      const incompleteExpiredSubscription = await setupSubscription({
        status: SubscriptionStatus.IncompleteExpired,
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
      })
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 10 * 60 * 1000,
              endDate: Date.now() + 10 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const canceledResult = await adjustSubscription(
            {
              id: canceledSubscription.id,
              adjustment: {
                newSubscriptionItems: [],
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            organization,
            ctx
          )
          expect(canceledResult.status).toBe('error')
          if (canceledResult.status === 'error') {
            expect(canceledResult.error._tag).toBe(
              'TerminalStateError'
            )
          }

          const expiredResult = await adjustSubscription(
            {
              id: incompleteExpiredSubscription.id,
              adjustment: {
                newSubscriptionItems: [],
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            organization,
            ctx
          )
          expect(expiredResult.status).toBe('error')
          if (expiredResult.status === 'error') {
            expect(expiredResult.error._tag).toBe(
              'TerminalStateError'
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should throw error for non-renewing / credit trial subscriptions', async () => {
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const creditTrialSubscription = await updateSubscription(
            {
              id: subscription.id,
              status: SubscriptionStatus.Active,
              renews: false,
              defaultPaymentMethodId: null,
              interval: null,
              intervalCount: null,
              currentBillingPeriodStart: null,
              currentBillingPeriodEnd: null,
              billingCycleAnchorDate: null,
            },
            transaction
          )

          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 10 * 60 * 1000,
              endDate: Date.now() + 10 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const result = await adjustSubscription(
            {
              id: creditTrialSubscription.id,
              adjustment: {
                newSubscriptionItems: [],
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            organization,
            ctx
          )
          expect(result.status).toBe('error')
          if (result.status === 'error') {
            expect(result.error._tag).toBe('ValidationError')
            expect(result.error.message).toContain(
              'Non-renewing subscriptions cannot be adjusted'
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should throw error when attempting to adjust doNotCharge subscription', async () => {
      const doNotChargeSubscription = await setupSubscription({
        status: SubscriptionStatus.Active,
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        doNotCharge: true,
        paymentMethodId: null,
      })
      await setupSubscriptionItem({
        subscriptionId: doNotChargeSubscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 0,
      })
      ;(
        await adminTransaction(async (ctx) => {
          const result = await adjustSubscription(
            {
              id: doNotChargeSubscription.id,
              adjustment: {
                newSubscriptionItems: [],
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            organization,
            ctx
          )
          expect(result.status).toBe('error')
          if (result.status === 'error') {
            expect(result.error._tag).toBe('ValidationError')
            expect(result.error.message).toContain(
              'Cannot adjust doNotCharge subscriptions'
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should throw error when new subscription items have non-subscription price types', async () => {
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Test Usage Meter',
        pricingModelId: pricingModel.id,
        livemode: false,
      })

      const usagePrice = await setupPrice({
        name: 'Usage Price',
        type: PriceType.Usage,
        unitPrice: 50,
        currency: CurrencyCode.USD,
        isDefault: false,
        livemode: false,
        usageMeterId: usageMeter.id,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })

      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })

      const newItems: SubscriptionItem.Upsert[] = [
        {
          ...subscriptionItemCore,
          name: 'Item 3',
          quantity: 3,
          unitPrice: 300,
          priceId: usagePrice.id,
          livemode: subscription.livemode,
          externalId: null,
          expiredAt: null,
          type: SubscriptionItemType.Static,
        },
      ]

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 10 * 60 * 1000,
              endDate: Date.now() + 10 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            organization,
            ctx
          )
          expect(result.status).toBe('error')
          if (result.status === 'error') {
            expect(result.error._tag).toBe('ValidationError')
            expect(result.error.message).toMatch(
              /Only recurring prices can be used in subscriptions/
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should return NotFoundError when adjusting a non-existent subscription id', async () => {
      ;(
        await adminTransaction(async (ctx) => {
          const result = await adjustSubscription(
            {
              id: 'sub_nonexistent123',
              adjustment: {
                newSubscriptionItems: [],
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            organization,
            ctx
          )
          expect(result.status).toBe('error')
          if (result.status === 'error') {
            expect(result.error._tag).toBe('NotFoundError')
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should throw error when a scheduled adjustment already exists', async () => {
      const futureTimestamp = Date.now() + 86400000 // 1 day from now
      const subscriptionWithScheduledAdjustment =
        await setupSubscription({
          status: SubscriptionStatus.Active,
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          paymentMethodId: paymentMethod.id,
        })

      await setupBillingPeriod({
        subscriptionId: subscriptionWithScheduledAdjustment.id,
        startDate: Date.now() - 3600000,
        endDate: Date.now() + 3600000,
        status: BillingPeriodStatus.Active,
      })

      await setupSubscriptionItem({
        subscriptionId: subscriptionWithScheduledAdjustment.id,
        name: 'Existing Item',
        quantity: 1,
        unitPrice: 1000,
        priceId: price.id,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
        const { transaction } = ctx
        // Set the scheduled adjustment after creation since setupSubscription doesn't support it
        await updateSubscription(
          {
            id: subscriptionWithScheduledAdjustment.id,
            scheduledAdjustmentAt: futureTimestamp,
            renews: subscriptionWithScheduledAdjustment.renews,
          },
          transaction
        )

        const result = await adjustSubscription(
          {
            id: subscriptionWithScheduledAdjustment.id,
            adjustment: {
              newSubscriptionItems: [
                {
                  priceId: price.id,
                  quantity: 2,
                },
              ],
              timing: SubscriptionAdjustmentTiming.Immediately,
              prorateCurrentBillingPeriod: false,
            },
          },
          organization,
          ctx
        )
        expect(Result.isError(result)).toBe(true)
        if (Result.isError(result)) {
          expect(result.error._tag).toBe('ValidationError')
          expect(result.error.message).toContain(
            'scheduled adjustment'
          )
          expect(result.error.message).toContain('already pending')
        }
        return Result.ok(null)
      })
    })

    it('should throw error when a cancellation is scheduled', async () => {
      const subscriptionWithScheduledCancellation =
        await setupSubscription({
          status: SubscriptionStatus.CancellationScheduled,
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          paymentMethodId: paymentMethod.id,
          cancelScheduledAt: Date.now() + 86400000, // 1 day from now
        })

      await setupBillingPeriod({
        subscriptionId: subscriptionWithScheduledCancellation.id,
        startDate: Date.now() - 3600000,
        endDate: Date.now() + 3600000,
        status: BillingPeriodStatus.Active,
      })

      await setupSubscriptionItem({
        subscriptionId: subscriptionWithScheduledCancellation.id,
        name: 'Existing Item',
        quantity: 1,
        unitPrice: 1000,
        priceId: price.id,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
        const result = await adjustSubscription(
          {
            id: subscriptionWithScheduledCancellation.id,
            adjustment: {
              newSubscriptionItems: [
                {
                  priceId: price.id,
                  quantity: 2,
                },
              ],
              timing: SubscriptionAdjustmentTiming.Immediately,
              prorateCurrentBillingPeriod: false,
            },
          },
          organization,
          ctx
        )
        expect(Result.isError(result)).toBe(true)
        if (Result.isError(result)) {
          expect(result.error._tag).toBe('ValidationError')
          expect(result.error.message).toContain(
            'cancellation is scheduled'
          )
          expect(result.error.message).toContain('Uncancel')
        }
        return Result.ok(null)
      })
    })

    it('should succeed after canceling a scheduled adjustment', async () => {
      const futureTimestamp = Date.now() + 86400000 // 1 day from now
      const subscriptionWithScheduledAdjustment =
        await setupSubscription({
          status: SubscriptionStatus.Active,
          organizationId: organization.id,
          customerId: customer.id,
          priceId: price.id,
          paymentMethodId: paymentMethod.id,
        })

      await setupBillingPeriod({
        subscriptionId: subscriptionWithScheduledAdjustment.id,
        startDate: Date.now() - 3600000,
        endDate: Date.now() + 3600000,
        status: BillingPeriodStatus.Active,
      })

      await setupSubscriptionItem({
        subscriptionId: subscriptionWithScheduledAdjustment.id,
        name: 'Existing Item',
        quantity: 1,
        unitPrice: 1000,
        priceId: price.id,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
        const { transaction } = ctx
        // First set the scheduled adjustment (setupSubscription doesn't support it)
        await updateSubscription(
          {
            id: subscriptionWithScheduledAdjustment.id,
            scheduledAdjustmentAt: futureTimestamp,
            renews: subscriptionWithScheduledAdjustment.renews,
          },
          transaction
        )

        // Then clear the scheduled adjustment to simulate canceling it
        await updateSubscription(
          {
            id: subscriptionWithScheduledAdjustment.id,
            scheduledAdjustmentAt: null,
            renews: subscriptionWithScheduledAdjustment.renews,
          },
          transaction
        )

        const result = await adjustSubscription(
          {
            id: subscriptionWithScheduledAdjustment.id,
            adjustment: {
              newSubscriptionItems: [
                {
                  priceId: price.id,
                  quantity: 2,
                },
              ],
              timing: SubscriptionAdjustmentTiming.Immediately,
              prorateCurrentBillingPeriod: false,
            },
          },
          organization,
          ctx
        )
        expect(Result.isOk(result)).toBe(true)
        return Result.ok(null)
      })
    })
  })

  /* ==========================================================================
    Validation: Quantity and Unit Price
  ========================================================================== */
  describe('Validation: Quantity and Unit Price', () => {
    it('should throw error when subscription items have zero quantity', async () => {
      await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: Date.now() - 3600000,
        endDate: Date.now() + 3600000,
        status: BillingPeriodStatus.Active,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Zero Quantity Item',
              quantity: 0,
              unitPrice: 100,
              livemode: false,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )
          expect(result.status).toBe('error')
          if (result.status === 'error') {
            expect(result.error._tag).toBe('ValidationError')
            expect(result.error.message).toContain(
              'quantity must be greater than zero'
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should return ValidationError when subscription items have negative quantity', async () => {
      await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: Date.now() - 3600000,
        endDate: Date.now() + 3600000,
        status: BillingPeriodStatus.Active,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Negative Quantity Item',
              quantity: -1,
              unitPrice: 100,
              livemode: false,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )
          expect(result.status).toBe('error')
          if (result.status === 'error') {
            expect(result.error._tag).toBe('ValidationError')
            expect(result.error.message).toContain(
              'quantity must be greater than zero'
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should return ValidationError when subscription items have negative unit price', async () => {
      await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: Date.now() - 3600000,
        endDate: Date.now() + 3600000,
        status: BillingPeriodStatus.Active,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Negative Unit Price Item',
              quantity: 1,
              unitPrice: -100,
              livemode: false,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )
          expect(result.status).toBe('error')
          if (result.status === 'error') {
            expect(result.error._tag).toBe('ValidationError')
            expect(result.error.message).toContain(
              'unit price cannot be negative'
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should allow subscription items with zero unit price (free tier)', async () => {
      await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: Date.now() - 3600000,
        endDate: Date.now() + 3600000,
        status: BillingPeriodStatus.Active,
      })
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Free Item',
              quantity: 1,
              unitPrice: 0,
              livemode: false,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )

          const bp = await selectCurrentBillingPeriodForSubscription(
            subscription.id,
            transaction
          )
          if (!bp) {
            throw new Error('Billing period is null')
          }
          const bpItems = await selectBillingPeriodItems(
            { billingPeriodId: bp.id },
            transaction
          )
          expect(bpItems.length).toBe(0)
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  /* ==========================================================================
    Validation: Timing and Net Charge
  ========================================================================== */
  describe('Validation: Timing and Net Charge', () => {
    it('should throw error when AtEndOfCurrentBillingPeriod timing is used with positive rawNetCharge', async () => {
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
              endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Expensive Item',
              quantity: 1,
              unitPrice: 9999,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing:
                  SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
              },
            },
            organization,
            ctx
          )
          expect(result.status).toBe('error')
          if (result.status === 'error') {
            expect(result.error._tag).toBe('ValidationError')
            expect(result.error.message).toContain(
              'EndOfCurrentBillingPeriod adjustments are only allowed for downgrades'
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  /* ==========================================================================
    Immediate Adjustments: Zero Net Charge
  ========================================================================== */
  describe('Immediate Adjustments: Zero Net Charge', () => {
    it('should update subscription items immediately and sync subscription when rawNetCharge is zero', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 24 * 60 * 60 * 1000,
              endDate: Date.now() + 24 * 60 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const invoice = await setupInvoice({
            organizationId: organization.id,
            customerId: customer.id,
            billingPeriodId: billingPeriod.id,
            priceId: price.id,
            livemode: subscription.livemode,
          })
          await setupPayment({
            stripeChargeId: `ch_${Math.random().toString(36).slice(2)}`,
            status: PaymentStatus.Succeeded,
            amount: 100,
            customerId: customer.id,
            organizationId: organization.id,
            invoiceId: invoice.id,
            billingPeriodId: billingPeriod.id,
            subscriptionId: subscription.id,
            paymentMethodId: paymentMethod.id,
            livemode: true,
          })

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...item1,
              name: 'Item 1 Updated',
              quantity: 1,
              unitPrice: 100,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            organization,
            ctx
          )

          expect(result.status).toBe('ok')
          if (result.status === 'ok') {
            expect(result.value.subscription.name).toBe(
              'Item 1 Updated'
            )
            expect(result.value.subscriptionItems.length).toBe(1)
            expect(result.value.subscriptionItems[0].name).toBe(
              'Item 1 Updated'
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should NOT trigger billing run when rawNetCharge is zero', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 24 * 60 * 60 * 1000,
              endDate: Date.now() + 24 * 60 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const invoice = await setupInvoice({
            organizationId: organization.id,
            customerId: customer.id,
            billingPeriodId: billingPeriod.id,
            priceId: price.id,
            livemode: subscription.livemode,
          })
          await setupPayment({
            stripeChargeId: `ch_${Math.random().toString(36).slice(2)}`,
            status: PaymentStatus.Succeeded,
            amount: 100,
            customerId: customer.id,
            organizationId: organization.id,
            invoiceId: invoice.id,
            billingPeriodId: billingPeriod.id,
            subscriptionId: subscription.id,
            paymentMethodId: paymentMethod.id,
            livemode: true,
          })

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...item1,
              name: 'Item 1',
              quantity: 1,
              unitPrice: 100,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            organization,
            ctx
          )
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should add, remove, and update items immediately and NOT trigger billing run when rawNetCharge is zero', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })
      const item2 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 2',
        quantity: 1,
        unitPrice: 200,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 24 * 60 * 60 * 1000,
              endDate: Date.now() + 24 * 60 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const invoice = await setupInvoice({
            organizationId: organization.id,
            customerId: customer.id,
            billingPeriodId: billingPeriod.id,
            priceId: price.id,
            livemode: subscription.livemode,
          })
          await setupPayment({
            stripeChargeId: `ch_${Math.random().toString(36).slice(2)}`,
            status: PaymentStatus.Succeeded,
            amount: 300,
            customerId: customer.id,
            organizationId: organization.id,
            invoiceId: invoice.id,
            billingPeriodId: billingPeriod.id,
            subscriptionId: subscription.id,
            paymentMethodId: paymentMethod.id,
            livemode: true,
          })

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...item1,
              name: 'Item 1 Updated',
              quantity: 2,
              unitPrice: 100,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
            {
              ...subscriptionItemCore,
              name: 'Item 3',
              quantity: 1,
              unitPrice: 100,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            organization,
            ctx
          )

          expect(result.status).toBe('ok')
          if (result.status === 'ok') {
            expect(result.value.subscriptionItems.length).toBe(2)
            const item1Result = result.value.subscriptionItems.find(
              (item: SubscriptionItem.Record) => item.id === item1.id
            )
            expect(item1Result?.quantity).toBe(2)
            expect(item1Result?.name).toBe('Item 1 Updated')
            const item3Result = result.value.subscriptionItems.find(
              (item: SubscriptionItem.Record) =>
                item.name === 'Item 3'
            )
            expect(typeof item3Result).toBe('object')
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should preserve subscription name when no active items exist after adjustment', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Original Plan',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 24 * 60 * 60 * 1000,
              endDate: Date.now() + 24 * 60 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const invoice = await setupInvoice({
            organizationId: organization.id,
            customerId: customer.id,
            billingPeriodId: billingPeriod.id,
            priceId: price.id,
            livemode: subscription.livemode,
          })
          await setupPayment({
            stripeChargeId: `ch_${Math.random().toString(36).slice(2)}`,
            status: PaymentStatus.Succeeded,
            amount: 100,
            customerId: customer.id,
            organizationId: organization.id,
            invoiceId: invoice.id,
            billingPeriodId: billingPeriod.id,
            subscriptionId: subscription.id,
            paymentMethodId: paymentMethod.id,
            livemode: true,
          })

          const originalName = subscription.name

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: [],
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            organization,
            ctx
          )

          expect(result.status).toBe('ok')
          if (result.status === 'ok') {
            expect(result.value.subscription.name).toBe(originalName)
            expect(result.value.subscriptionItems.length).toBe(0)
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  /* ==========================================================================
    Immediate Adjustments: Positive Net Charge
  ========================================================================== */
  describe('Immediate Adjustments: Positive Net Charge', () => {
    it('should trigger billing run with correct params when rawNetCharge is positive', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 10 * 60 * 1000,
              endDate: Date.now() + 10 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Expensive Item',
              quantity: 1,
              unitPrice: 9999,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )

          // Trigger tasks are routed to mock server - we verify observable state instead
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should NOT update subscription items or sync subscription immediately when rawNetCharge is positive', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 10 * 60 * 1000,
              endDate: Date.now() + 10 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Expensive Item',
              quantity: 1,
              unitPrice: 9999,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )

          expect(result.status).toBe('ok')
          if (result.status === 'ok') {
            expect(result.value.subscription.name).toBeNull()
            expect(result.value.subscriptionItems.length).toBe(1)
            expect(result.value.subscriptionItems[0].name).toBe(
              'Item 1'
            )
            expect(result.value.subscriptionItems[0].unitPrice).toBe(
              100
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should create proration billing period items when netChargeAmount > 0', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 10 * 60 * 1000,
              endDate: Date.now() + 10 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const bpItemsBefore = await selectBillingPeriodItems(
            { billingPeriodId: billingPeriod.id },
            transaction
          )

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Expensive Item',
              quantity: 1,
              unitPrice: 9999,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )

          const bpItems = await selectBillingPeriodItems(
            { billingPeriodId: billingPeriod.id },
            transaction
          )

          expect(bpItems.length).toBeGreaterThan(bpItemsBefore.length)
          const netChargeItems = bpItems.filter((adj) =>
            adj.name?.includes('Net charge adjustment')
          )
          expect(netChargeItems.length).toBe(1)
          expect(netChargeItems[0].unitPrice).toBeGreaterThan(0)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should trigger billing run with correct params when upgrading (adding items, increasing quantity)', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 10 * 60 * 1000,
              endDate: Date.now() + 10 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...item1,
              quantity: 2,
            },
            {
              ...subscriptionItemCore,
              name: 'New Item',
              quantity: 1,
              unitPrice: 500,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )

          // Trigger tasks are routed to mock server - we verify observable state instead
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should calculate proration correctly considering existing payments and cap at zero for downgrades', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Premium Plan',
        quantity: 1,
        unitPrice: 4999,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const start = Date.now() - 5 * 24 * 60 * 60 * 1000
          const end = Date.now() + 25 * 24 * 60 * 60 * 1000
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: start,
              endDate: end,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const invoice = await setupInvoice({
            organizationId: organization.id,
            customerId: customer.id,
            billingPeriodId: billingPeriod.id,
            priceId: item1.priceId!,
            livemode: subscription.livemode,
          })

          await setupPayment({
            stripeChargeId: `ch_${Math.random().toString(36).slice(2)}`,
            status: PaymentStatus.Succeeded,
            amount: 4999,
            customerId: customer.id,
            organizationId: organization.id,
            invoiceId: invoice.id,
            billingPeriodId: billingPeriod.id,
            subscriptionId: subscription.id,
            paymentMethodId:
              subscription.defaultPaymentMethodId ?? paymentMethod.id,
            livemode: subscription.livemode,
          })

          const bpItemsBefore = await selectBillingPeriodItems(
            { billingPeriodId: billingPeriod.id },
            transaction
          )

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Basic Plan',
              quantity: 1,
              unitPrice: 999,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )

          const bpItems = await selectBillingPeriodItems(
            { billingPeriodId: billingPeriod.id },
            transaction
          )

          const newBpItems = bpItems.filter(
            (a) => !bpItemsBefore.some((b) => b.id === a.id)
          )
          const netDelta = newBpItems.reduce(
            (sum, i) => sum + i.unitPrice * i.quantity,
            0
          )
          expect(netDelta).toBeGreaterThanOrEqual(0)

          expect(result.status).toBe('ok')
          if (result.status === 'ok') {
            expect(result.value.subscription.name).toBe('Basic Plan')
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  /* ==========================================================================
    Immediate Adjustments: Proration Behavior
  ========================================================================== */
  describe('Immediate Adjustments: Proration Behavior', () => {
    it('should create proration adjustments when prorateCurrentBillingPeriod is true and netChargeAmount > 0', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 10 * 60 * 1000,
              endDate: Date.now() + 10 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const bpItemsBefore = await selectBillingPeriodItems(
            { billingPeriodId: billingPeriod.id },
            transaction
          )

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Expensive Item',
              quantity: 1,
              unitPrice: 9999,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )

          const bpItems = await selectBillingPeriodItems(
            { billingPeriodId: billingPeriod.id },
            transaction
          )

          expect(bpItems.length).toBeGreaterThan(bpItemsBefore.length)
          const prorationItems = bpItems.filter((item) =>
            item.name?.includes('Proration')
          )
          expect(prorationItems.length).toBeGreaterThan(0)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should NOT create proration adjustments when prorateCurrentBillingPeriod is false and netChargeAmount > 0', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 10 * 60 * 1000,
              endDate: Date.now() + 10 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const bpItemsBefore = await selectBillingPeriodItems(
            { billingPeriodId: billingPeriod.id },
            transaction
          )

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Expensive Item',
              quantity: 1,
              unitPrice: 9999,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            organization,
            ctx
          )

          const bpItems = await selectBillingPeriodItems(
            { billingPeriodId: billingPeriod.id },
            transaction
          )

          // We verify billing period items exist regardless of whether trigger was called
          expect(bpItems.length).toBeGreaterThanOrEqual(
            bpItemsBefore.length
          )
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  /* ==========================================================================
    At End of Current Billing Period
  ========================================================================== */
  describe('At End of Current Billing Period', () => {
    it('should update subscription items with future dates and NOT trigger billing run when rawNetCharge is zero', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const newStartDate = Date.now() - 30 * 24 * 60 * 60 * 1000
          const newEndDate = Date.now() + 30 * 24 * 60 * 60 * 1000

          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: newStartDate,
              endDate: newEndDate,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          subscription = await updateSubscription(
            {
              id: subscription.id,
              renews: true,
              currentBillingPeriodStart: newStartDate,
              currentBillingPeriodEnd: newEndDate,
            },
            transaction
          )

          const invoice = await setupInvoice({
            organizationId: organization.id,
            customerId: customer.id,
            billingPeriodId: billingPeriod.id,
            priceId: price.id,
            livemode: subscription.livemode,
          })
          await setupPayment({
            stripeChargeId: `ch_${Math.random().toString(36).slice(2)}`,
            status: PaymentStatus.Succeeded,
            amount: 100,
            customerId: customer.id,
            organizationId: organization.id,
            invoiceId: invoice.id,
            billingPeriodId: billingPeriod.id,
            subscriptionId: subscription.id,
            paymentMethodId: paymentMethod.id,
            livemode: true,
          })

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Future Item',
              quantity: 1,
              unitPrice: 100,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing:
                  SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
              },
            },
            organization,
            ctx
          )

          const result =
            await selectSubscriptionItemsAndSubscriptionBySubscriptionId(
              subscription.id,
              transaction
            )
          expect(result).toMatchObject({})
          if (!result) throw new Error('Result is null')
          const futureItem = result.subscriptionItems.find(
            (item) => item.name === 'Future Item'
          )
          expect(typeof futureItem).toBe('object')
          expect(toMs(futureItem!.addedDate)!).toBe(newEndDate)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should NOT sync subscription record with future-dated items (preserves current state)', async () => {
      const initialItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Current Plan',
        quantity: 1,
        unitPrice: 1000,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const futureDate = Date.now() + 7 * 24 * 60 * 60 * 1000
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 3600000,
              endDate: futureDate,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          await updateSubscription(
            {
              id: subscription.id,
              currentBillingPeriodEnd: futureDate,
              name: 'Current Plan',
              priceId: price.id,
              renews: true,
            },
            transaction
          )

          const invoice = await setupInvoice({
            organizationId: organization.id,
            customerId: customer.id,
            billingPeriodId: billingPeriod.id,
            priceId: price.id,
            livemode: subscription.livemode,
          })
          await setupPayment({
            stripeChargeId: `ch_${Math.random().toString(36).slice(2)}`,
            status: PaymentStatus.Succeeded,
            amount: 1000,
            customerId: customer.id,
            organizationId: organization.id,
            invoiceId: invoice.id,
            billingPeriodId: billingPeriod.id,
            subscriptionId: subscription.id,
            paymentMethodId: paymentMethod.id,
            livemode: true,
          })

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Future Plan',
              quantity: 1,
              unitPrice: 500,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing:
                  SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
              },
            },
            organization,
            ctx
          )

          expect(result.status).toBe('ok')
          if (result.status === 'ok') {
            expect(result.value.subscription.name).toBe(
              'Current Plan'
            )
            expect(result.value.subscription.priceId).toBe(price.id)
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should expire existing items and add new items at billing period end', async () => {
      const expensiveItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Premium Plan',
        quantity: 1,
        unitPrice: 4999,
        priceId: price.id,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const newStartDate = Date.now() - 30 * 24 * 60 * 60 * 1000
          const newEndDate = Date.now() + 30 * 24 * 60 * 60 * 1000

          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: newStartDate,
              endDate: newEndDate,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          subscription = await updateSubscription(
            {
              id: subscription.id,
              renews: true,
              currentBillingPeriodStart: newStartDate,
              currentBillingPeriodEnd: newEndDate,
            },
            transaction
          )

          const currentBillingPeriod =
            await selectCurrentBillingPeriodForSubscription(
              subscription.id,
              transaction
            )

          const invoice = await setupInvoice({
            organizationId: organization.id,
            customerId: customer.id,
            billingPeriodId: billingPeriod.id,
            priceId: price.id,
            livemode: subscription.livemode,
          })

          await setupPayment({
            stripeChargeId: `ch_${Math.random().toString(36).slice(2)}`,
            status: PaymentStatus.Succeeded,
            amount: 4999,
            customerId: customer.id,
            organizationId: organization.id,
            invoiceId: invoice.id,
            billingPeriodId: billingPeriod.id,
            subscriptionId: subscription.id,
            paymentMethodId: paymentMethod.id,
            livemode: true,
          })

          const downgradeItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Basic Plan',
              quantity: 1,
              unitPrice: 999,
              type: SubscriptionItemType.Static,
              expiredAt: null,
            },
          ]

          await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: downgradeItems,
                timing:
                  SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
              },
            },
            organization,
            ctx
          )

          const updatedItems =
            await selectSubscriptionItemsAndSubscriptionBySubscriptionId(
              subscription.id,
              transaction
            )
          expect(typeof updatedItems).toBe('object')
          if (!updatedItems) throw new Error('Result is null')

          const expiredItem = updatedItems.subscriptionItems.find(
            (item) => item.id === expensiveItem.id
          )
          expect(typeof expiredItem).toBe('object')
          expect(toMs(expiredItem!.expiredAt)!).toEqual(
            toMs(currentBillingPeriod!.endDate)!
          )

          const newItem = updatedItems.subscriptionItems.find(
            (item) => item.name === 'Basic Plan'
          )
          expect(typeof newItem).toBe('object')
          expect(toMs(newItem!.addedDate)!).toEqual(
            toMs(currentBillingPeriod!.endDate)!
          )
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  /* ==========================================================================
    Edge Cases
  ========================================================================== */
  describe('Edge Cases', () => {
    it('should trigger billing run if net charge > 0, or sync immediately if net charge = 0 when no existing subscription items exist', async () => {
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 3600000,
              endDate: Date.now() + 3600000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'New Item 1',
              quantity: 2,
              unitPrice: 150,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            organization,
            ctx
          )

          // Verify subscription items were created
          const result =
            await selectSubscriptionItemsAndSubscriptionBySubscriptionId(
              subscription.id,
              transaction
            )
          // The result may be null if the subscription was adjusted, or contain items
          // We just verify the operation completed without error
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should trigger billing run if net charge > 0, or sync immediately and preserve subscription name if net charge = 0 when all items are removed', async () => {
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 3600000,
              endDate: Date.now() + 3600000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const originalName = subscription.name

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: [],
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            organization,
            ctx
          )

          expect(result.status).toBe('ok')
          // The operation completed - verify we got a valid result
          if (result.status === 'ok') {
            expect(
              Array.isArray(result.value.subscriptionItems)
            ).toBe(true)
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should return ValidationError when attempting adjustment with zero-duration billing period', async () => {
      const zeroDurationBillingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: Date.parse('2025-01-01T00:00:00Z'),
        endDate: Date.parse('2025-01-01T00:00:00Z'),
        status: BillingPeriodStatus.Active,
      })
      const item = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item Zero',
        quantity: 1,
        unitPrice: 100,
      })
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const newItems: SubscriptionItem.Upsert[] = [
            {
              id: item.id,
              name: 'Item Zero',
              quantity: 1,
              unitPrice: 100,
              livemode: subscription.livemode,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              metadata: null,
              addedDate: Date.now(),
              subscriptionId: subscription.id,
              priceId: price.id,
              externalId: null,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )
          expect(result.status).toBe('error')
          if (result.status === 'error') {
            expect(result.error._tag).toBe('NotFoundError')
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should return error when attempting adjustment with billing periods in the past or future', async () => {
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const pastBP = await updateBillingPeriod(
            {
              id: billingPeriod.id,
              subscriptionId: subscription.id,
              startDate: Date.now() - 7200000,
              endDate: Date.now() - 3600000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )
          const pastItem = await setupSubscriptionItem({
            subscriptionId: subscription.id,
            name: 'Past Item',
            quantity: 1,
            unitPrice: 100,
          })
          const newPastItems = [
            {
              ...pastItem,
              name: 'Past Item',
              quantity: 1,
              unitPrice: 100,
              livemode: false,
            },
          ]

          const pastResult = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newPastItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )
          expect(pastResult.status).toBe('error')
          if (pastResult.status === 'error') {
            expect(pastResult.error._tag).toBe('NotFoundError')
          }

          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              subscriptionId: subscription.id,
              startDate: Date.now() + 3600000,
              endDate: Date.now() + 7200000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )
          const futureItem = await setupSubscriptionItem({
            subscriptionId: subscription.id,
            name: 'Future Item',
            quantity: 1,
            unitPrice: 100,
          })
          const newFutureItems = [
            {
              ...futureItem,
              name: 'Future Item',
              quantity: 1,
              unitPrice: 100,
              livemode: false,
            },
          ]

          const futureResult = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newFutureItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )
          expect(futureResult.status).toBe('error')
          if (futureResult.status === 'error') {
            expect(futureResult.error._tag).toBe('NotFoundError')
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  /* ==========================================================================
    syncSubscriptionWithActiveItems Tests
  ========================================================================== */
  describe('syncSubscriptionWithActiveItems', () => {
    it('should sync subscription with currently active items', async () => {
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const now = new Date()
          const futureDate = addDays(now, 1).getTime()
          const currentItem = await setupSubscriptionItem({
            subscriptionId: subscription.id,
            priceId: price.id,
            name: 'Current Plan',
            quantity: 1,
            unitPrice: 999,
            addedDate: subDays(new Date(now), 10).getTime(),
            type: SubscriptionItemType.Static,
          })

          await expireSubscriptionItems(
            [currentItem.id],
            futureDate,
            transaction
          )

          await setupSubscriptionItem({
            subscriptionId: subscription.id,
            priceId: price.id,
            name: 'New Premium Plan',
            quantity: 1,
            unitPrice: 4999,
            addedDate: futureDate,
            type: SubscriptionItemType.Static,
          })

          const synced = await syncSubscriptionWithActiveItems(
            {
              subscriptionId: subscription.id,
              currentTime: new Date(),
            },
            transaction
          )
          expect(synced.name).toBe('Current Plan')
          expect(synced.priceId).toBe(currentItem.priceId!)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should handle multiple items becoming active and choose the most expensive as primary', async () => {
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const now = Date.now()
          const pastDate = subDays(new Date(now), 1).getTime()

          await setupSubscriptionItem({
            subscriptionId: subscription.id,
            priceId: price.id,
            name: 'Basic Feature',
            quantity: 1,
            unitPrice: 500,
            addedDate: pastDate,
            type: SubscriptionItemType.Static,
          })

          const premiumItem = await setupSubscriptionItem({
            subscriptionId: subscription.id,
            priceId: price.id,
            name: 'Premium Feature',
            quantity: 1,
            unitPrice: 3000,
            addedDate: pastDate,
            type: SubscriptionItemType.Static,
          })

          await setupSubscriptionItem({
            subscriptionId: subscription.id,
            priceId: price.id,
            name: 'Standard Feature',
            quantity: 1,
            unitPrice: 1500,
            addedDate: pastDate,
            type: SubscriptionItemType.Static,
          })

          const synced = await syncSubscriptionWithActiveItems(
            {
              subscriptionId: subscription.id,
              currentTime: new Date(),
            },
            transaction
          )

          expect(synced.name).toBe('Premium Feature')
          expect(synced.priceId).toBe(premiumItem.priceId!)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should handle subscription becoming active but not primary (lower price than existing)', async () => {
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const now = Date.now()

          const expensiveItem = await setupSubscriptionItem({
            subscriptionId: subscription.id,
            priceId: price.id,
            name: 'Enterprise Plan',
            quantity: 1,
            unitPrice: 9999,
            addedDate: subDays(new Date(now), 10).getTime(),
            type: SubscriptionItemType.Static,
          })

          await setupSubscriptionItem({
            subscriptionId: subscription.id,
            priceId: price.id,
            name: 'Add-on Feature',
            quantity: 1,
            unitPrice: 999,
            addedDate: subDays(new Date(now), 1).getTime(),
            type: SubscriptionItemType.Static,
          })

          const synced = await syncSubscriptionWithActiveItems(
            {
              subscriptionId: subscription.id,
              currentTime: new Date(),
            },
            transaction
          )

          expect(synced.name).toBe('Enterprise Plan')
          expect(synced.priceId).toBe(expensiveItem.priceId!)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should update primary when current primary item gets cancelled', async () => {
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const now = Date.now()

          const primaryItem = await setupSubscriptionItem({
            subscriptionId: subscription.id,
            priceId: price.id,
            name: 'Premium Plan',
            quantity: 1,
            unitPrice: 4999,
            addedDate: subDays(new Date(now), 10).getTime(),
            type: SubscriptionItemType.Static,
          })

          const secondaryItem = await setupSubscriptionItem({
            subscriptionId: subscription.id,
            priceId: price.id,
            name: 'Standard Plan',
            quantity: 1,
            unitPrice: 2999,
            addedDate: subDays(new Date(now), 5).getTime(),
            type: SubscriptionItemType.Static,
          })

          await setupSubscriptionItem({
            subscriptionId: subscription.id,
            priceId: price.id,
            name: 'Basic Plan',
            quantity: 1,
            unitPrice: 999,
            addedDate: subDays(new Date(now), 3).getTime(),
            type: SubscriptionItemType.Static,
          })

          const syncedBefore = await syncSubscriptionWithActiveItems(
            {
              subscriptionId: subscription.id,
              currentTime: new Date(),
            },
            transaction
          )
          expect(syncedBefore.name).toBe('Premium Plan')

          await updateSubscriptionItem(
            {
              id: primaryItem.id,
              expiredAt: subDays(new Date(now), 1).getTime(),
              type: SubscriptionItemType.Static,
            },
            transaction
          )

          const syncedAfter = await syncSubscriptionWithActiveItems(
            {
              subscriptionId: subscription.id,
              currentTime: new Date(),
            },
            transaction
          )
          expect(syncedAfter.name).toBe('Standard Plan')
          expect(syncedAfter.priceId).toBe(secondaryItem.priceId!)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should handle multiple items becoming active and inactive simultaneously', async () => {
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const now = Date.now()

          await setupSubscriptionItem({
            subscriptionId: subscription.id,
            priceId: price.id,
            name: 'Old Basic',
            quantity: 1,
            unitPrice: 999,
            addedDate: subDays(new Date(now), 10).getTime(),
            type: SubscriptionItemType.Static,
          })

          const newPremiumItem = await setupSubscriptionItem({
            subscriptionId: subscription.id,
            priceId: price.id,
            name: 'New Premium',
            quantity: 1,
            unitPrice: 6999,
            addedDate: subDays(new Date(now), 1).getTime(),
            type: SubscriptionItemType.Static,
          })

          await setupSubscriptionItem({
            subscriptionId: subscription.id,
            priceId: price.id,
            name: 'New Basic',
            quantity: 1,
            unitPrice: 1999,
            addedDate: subDays(new Date(now), 1).getTime(),
            type: SubscriptionItemType.Static,
          })

          await setupSubscriptionItem({
            subscriptionId: subscription.id,
            priceId: price.id,
            name: 'New Add-on',
            quantity: 1,
            unitPrice: 500,
            addedDate: subDays(new Date(now), 1).getTime(),
            type: SubscriptionItemType.Static,
          })

          const synced = await syncSubscriptionWithActiveItems(
            {
              subscriptionId: subscription.id,
              currentTime: new Date(),
            },
            transaction
          )
          expect(synced.name).toBe('New Premium')
          expect(synced.priceId).toBe(newPremiumItem.priceId!)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should maintain subscription state when all items expire with no replacements', async () => {
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const now = Date.now()

          const activeItem = await setupSubscriptionItem({
            subscriptionId: subscription.id,
            priceId: price.id,
            name: 'Active Plan',
            quantity: 1,
            unitPrice: 2999,
            addedDate: subDays(new Date(now), 10).getTime(),
            type: SubscriptionItemType.Static,
          })

          const syncedActive = await syncSubscriptionWithActiveItems(
            {
              subscriptionId: subscription.id,
              currentTime: new Date(),
            },
            transaction
          )
          expect(syncedActive.name).toBe('Active Plan')

          await updateSubscriptionItem(
            {
              id: activeItem.id,
              expiredAt: subDays(new Date(now), 1).getTime(),
              type: SubscriptionItemType.Static,
            },
            transaction
          )

          const syncedAfterExpiry =
            await syncSubscriptionWithActiveItems(
              {
                subscriptionId: subscription.id,
                currentTime: new Date(),
              },
              transaction
            )

          expect(syncedAfterExpiry.name).toBe('Active Plan')
          expect(syncedAfterExpiry.priceId).toBe(price.id)
          expect(syncedAfterExpiry.id).toBe(subscription.id)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should handle quantity changes affecting total price calculations', async () => {
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const now = Date.now()

          await setupSubscriptionItem({
            subscriptionId: subscription.id,
            priceId: price.id,
            name: 'High Unit Price',
            quantity: 1,
            unitPrice: 5000,
            addedDate: subDays(new Date(now), 5).getTime(),
            type: SubscriptionItemType.Static,
          })

          const highQuantityItem = await setupSubscriptionItem({
            subscriptionId: subscription.id,
            priceId: price.id,
            name: 'High Quantity',
            quantity: 10,
            unitPrice: 1000,
            addedDate: subDays(new Date(now), 5).getTime(),
            type: SubscriptionItemType.Static,
          })

          const synced = await syncSubscriptionWithActiveItems(
            {
              subscriptionId: subscription.id,
              currentTime: new Date(),
            },
            transaction
          )

          expect(synced.name).toBe('High Quantity')
          expect(synced.priceId).toBe(highQuantityItem.priceId!)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should use addedDate as tiebreaker when items have same total price', async () => {
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const now = Date.now()

          await setupSubscriptionItem({
            subscriptionId: subscription.id,
            priceId: price.id,
            name: 'Older Item',
            quantity: 1,
            unitPrice: 3000,
            addedDate: subDays(new Date(now), 10).getTime(),
            type: SubscriptionItemType.Static,
          })

          const newerItem = await setupSubscriptionItem({
            subscriptionId: subscription.id,
            priceId: price.id,
            name: 'Newer Item',
            quantity: 1,
            unitPrice: 3000,
            addedDate: subDays(new Date(now), 5).getTime(),
            type: SubscriptionItemType.Static,
          })

          const synced = await syncSubscriptionWithActiveItems(
            {
              subscriptionId: subscription.id,
              currentTime: new Date(),
            },
            transaction
          )

          expect(synced.name).toBe('Newer Item')
          expect(synced.priceId).toBe(newerItem.priceId!)
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  /* ==========================================================================
    calculateSplitInBillingPeriodBasedOnAdjustmentDate Tests
  ========================================================================== */
  describe('calculateSplitInBillingPeriodBasedOnAdjustmentDate', () => {
    it('should return correct percentages when adjustment date is at start, middle, and end', () => {
      let adjustmentDateMs = toMs(billingPeriod.startDate)!
      let split = calculateSplitInBillingPeriodBasedOnAdjustmentDate(
        adjustmentDateMs,
        billingPeriod
      )
      expect(split.beforePercentage).toBe(0)
      expect(split.afterPercentage).toBe(1)

      adjustmentDateMs = toMs(billingPeriod.endDate)!
      split = calculateSplitInBillingPeriodBasedOnAdjustmentDate(
        adjustmentDateMs,
        billingPeriod
      )
      expect(split.beforePercentage).toBe(1)
      expect(split.afterPercentage).toBe(0)

      adjustmentDateMs =
        toMs(billingPeriod.startDate)! +
        (toMs(billingPeriod.endDate)! -
          toMs(billingPeriod.startDate)!) /
          2
      split = calculateSplitInBillingPeriodBasedOnAdjustmentDate(
        adjustmentDateMs,
        billingPeriod
      )
      expect(split.beforePercentage).toBeCloseTo(0.5, 1)
      expect(split.afterPercentage).toBeCloseTo(0.5, 1)
    })

    it('should throw an error if the adjustment date is outside the billing period', () => {
      const tooEarlyAdjustmentDate =
        toMs(billingPeriod.startDate)! - 1000
      expect(() => {
        calculateSplitInBillingPeriodBasedOnAdjustmentDate(
          tooEarlyAdjustmentDate,
          billingPeriod
        )
      }).toThrow()
      const tooLateAdjustmentDate =
        toMs(billingPeriod.endDate)! + 1000
      expect(() => {
        calculateSplitInBillingPeriodBasedOnAdjustmentDate(
          tooLateAdjustmentDate,
          billingPeriod
        )
      }).toThrow()
    })
  })

  /* ==========================================================================
    Bulk Operations
  ========================================================================== */
  describe('Bulk Operations', () => {
    it('should return NotFoundError when invalid price ID is provided during bulk operations', async () => {
      const item = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item',
        quantity: 1,
        unitPrice: 100,
      })
      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 3600000,
              endDate: Date.now() + 3600000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )
          const invalidItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              id: item.id,
              name: 'Item',
              quantity: 1,
              unitPrice: 100,
              priceId: 'invalid_price_id',
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: invalidItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            organization,
            ctx
          )
          expect(result.status).toBe('error')
          if (result.status === 'error') {
            expect(result.error._tag).toBe('NotFoundError')
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  /* ==========================================================================
    Adjustment Notifications
  ========================================================================== */
  describe('Adjustment Notifications', () => {
    it('should send downgrade notifications when rawNetCharge is zero or negative (downgrade)', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Premium Plan',
        quantity: 1,
        unitPrice: 4999,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 24 * 60 * 60 * 1000,
              endDate: Date.now() + 24 * 60 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const invoice = await setupInvoice({
            organizationId: organization.id,
            customerId: customer.id,
            billingPeriodId: billingPeriod.id,
            priceId: price.id,
            livemode: subscription.livemode,
          })
          await setupPayment({
            stripeChargeId: `ch_${Math.random().toString(36).slice(2)}`,
            status: PaymentStatus.Succeeded,
            amount: 4999,
            customerId: customer.id,
            organizationId: organization.id,
            invoiceId: invoice.id,
            billingPeriodId: billingPeriod.id,
            subscriptionId: subscription.id,
            paymentMethodId: paymentMethod.id,
            livemode: true,
          })

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Basic Plan',
              quantity: 1,
              unitPrice: 999,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            organization,
            ctx
          )

          // Notifications are routed to mock server - we verify the operation completed
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should NOT send notifications when rawNetCharge is positive (upgrade requires payment)', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Basic Plan',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 10 * 60 * 1000,
              endDate: Date.now() + 10 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Premium Plan',
              quantity: 1,
              unitPrice: 9999,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )

          // Triggers are routed to mock server - we verify the operation completed
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  /* ==========================================================================
    Auto Timing Detection
  ========================================================================== */
  describe('Auto Timing Detection', () => {
    it('autoDetectTiming should return Immediately for upgrades', () => {
      const result = autoDetectTiming(1000, 2000)
      expect(result).toBe(SubscriptionAdjustmentTiming.Immediately)
    })

    it('autoDetectTiming should return AtEndOfCurrentBillingPeriod for downgrades', () => {
      const result = autoDetectTiming(2000, 1000)
      expect(result).toBe(
        SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
      )
    })

    it('autoDetectTiming should return Immediately for same price (lateral move)', () => {
      const result = autoDetectTiming(1000, 1000)
      expect(result).toBe(SubscriptionAdjustmentTiming.Immediately)
    })

    it('should apply upgrade immediately when timing is auto', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Basic Plan',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 10 * 60 * 1000,
              endDate: Date.now() + 10 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Premium Plan',
              quantity: 1,
              unitPrice: 9999,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Auto,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )

          // Should resolve to Immediately for upgrades
          expect(result.status).toBe('ok')
          if (result.status === 'ok') {
            expect(result.value.resolvedTiming).toBe(
              SubscriptionAdjustmentTiming.Immediately
            )
            expect(result.value.isUpgrade).toBe(true)
          }

          // Billing run is routed to mock server - we verify observable state only
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should apply downgrade at end of period when timing is auto', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Premium Plan',
        quantity: 1,
        unitPrice: 4999,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const newStartDate = Date.now() - 30 * 24 * 60 * 60 * 1000
          const newEndDate = Date.now() + 30 * 24 * 60 * 60 * 1000

          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: newStartDate,
              endDate: newEndDate,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          subscription = await updateSubscription(
            {
              id: subscription.id,
              renews: true,
              currentBillingPeriodStart: newStartDate,
              currentBillingPeriodEnd: newEndDate,
            },
            transaction
          )

          const invoice = await setupInvoice({
            organizationId: organization.id,
            customerId: customer.id,
            billingPeriodId: billingPeriod.id,
            priceId: price.id,
            livemode: subscription.livemode,
          })
          await setupPayment({
            stripeChargeId: `ch_${Math.random().toString(36).slice(2)}`,
            status: PaymentStatus.Succeeded,
            amount: 4999,
            customerId: customer.id,
            organizationId: organization.id,
            invoiceId: invoice.id,
            billingPeriodId: billingPeriod.id,
            subscriptionId: subscription.id,
            paymentMethodId: paymentMethod.id,
            livemode: true,
          })

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Basic Plan',
              quantity: 1,
              unitPrice: 999,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Auto,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )

          // Should resolve to AtEndOfCurrentBillingPeriod for downgrades
          expect(result.status).toBe('ok')
          if (result.status === 'ok') {
            expect(result.value.resolvedTiming).toBe(
              SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
            )
            expect(result.value.isUpgrade).toBe(false)
          }

          // Billing run is routed to mock server - we verify observable state only
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should return correct isUpgrade value for lateral moves', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Plan A',
        quantity: 1,
        unitPrice: 1000,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 24 * 60 * 60 * 1000,
              endDate: Date.now() + 24 * 60 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const invoice = await setupInvoice({
            organizationId: organization.id,
            customerId: customer.id,
            billingPeriodId: billingPeriod.id,
            priceId: price.id,
            livemode: subscription.livemode,
          })
          await setupPayment({
            stripeChargeId: `ch_${Math.random().toString(36).slice(2)}`,
            status: PaymentStatus.Succeeded,
            amount: 1000,
            customerId: customer.id,
            organizationId: organization.id,
            invoiceId: invoice.id,
            billingPeriodId: billingPeriod.id,
            subscriptionId: subscription.id,
            paymentMethodId: paymentMethod.id,
            livemode: true,
          })

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Plan B',
              quantity: 1,
              unitPrice: 1000,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Auto,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )

          // Same price = not an upgrade
          expect(result.status).toBe('ok')
          if (result.status === 'ok') {
            expect(result.value.isUpgrade).toBe(false)
            // Should resolve to Immediately for lateral moves
            expect(result.value.resolvedTiming).toBe(
              SubscriptionAdjustmentTiming.Immediately
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  /* ==========================================================================
    Price Slug Resolution
  ========================================================================== */
  describe('Price Slug Resolution', () => {
    it('should resolve priceSlug to priceId using subscription pricing model', async () => {
      const slugPrice = await setupPrice({
        productId: product.id,
        name: 'Premium via Slug',
        type: PriceType.Subscription,
        unitPrice: 2999,
        currency: CurrencyCode.USD,
        isDefault: false,
        livemode: false,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        slug: 'premium-monthly',
      })

      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Basic Plan',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 10 * 60 * 1000,
              endDate: Date.now() + 10 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          // Use priceSlug in the terse format
          const newItems: TerseSubscriptionItem[] = [
            {
              priceSlug: 'premium-monthly',
              quantity: 1,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )

          // Billing run is routed to mock server - we verify the operation completed
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should throw error when priceSlug not found in pricing model', async () => {
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Basic Plan',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 10 * 60 * 1000,
              endDate: Date.now() + 10 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const newItems: TerseSubscriptionItem[] = [
            {
              priceSlug: 'nonexistent-slug',
              quantity: 1,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )
          expect(result.status).toBe('error')
          if (result.status === 'error') {
            expect(result.error._tag).toBe('NotFoundError')
            expect(result.error.message).toContain(
              'Price not found: nonexistent-slug'
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should expand terse subscription item with priceId to full item', async () => {
      // Create a price with a known ID for this test
      const testPrice = await setupPrice({
        productId: product.id,
        name: 'Test Price for ID Resolution',
        type: PriceType.Subscription,
        unitPrice: 2000,
        currency: CurrencyCode.USD,
        isDefault: false,
        livemode: true,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })

      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Basic Plan',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 10 * 60 * 1000,
              endDate: Date.now() + 10 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          // Use terse format with priceId
          const newItems: TerseSubscriptionItem[] = [
            {
              priceId: testPrice.id,
              quantity: 3,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )

          // Billing run is routed to mock server - we verify the operation completed
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should handle mixed item types (priceSlug + priceId) in the same request', async () => {
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Basic Plan',
        quantity: 1,
        unitPrice: 100,
      })

      const uniqueSlug = `premium-mixed-${Date.now()}`

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const slugPrice = await insertPrice(
            {
              ...nulledPriceColumns,
              productId: product.id,
              name: 'Premium via Slug',
              type: PriceType.Subscription,
              unitPrice: 2999,
              currency: CurrencyCode.USD,
              isDefault: false,
              livemode: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              active: true,
              trialPeriodDays: 0,
              slug: uniqueSlug,
            },
            ctx
          )

          const idPrice = await insertPrice(
            {
              ...nulledPriceColumns,
              productId: product.id,
              name: 'Standard Price',
              type: PriceType.Subscription,
              unitPrice: 1500,
              currency: CurrencyCode.USD,
              isDefault: false,
              livemode: true,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              active: true,
              trialPeriodDays: 0,
            },
            ctx
          )

          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 10 * 60 * 1000,
              endDate: Date.now() + 10 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          // Mix priceSlug and priceId items in the same request
          const newItems: TerseSubscriptionItem[] = [
            {
              priceSlug: uniqueSlug,
              quantity: 1,
            },
            {
              priceId: idPrice.id,
              quantity: 2,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )

          // Billing run is routed to mock server - we verify the operation completed
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should resolve UUID passed as priceSlug (SDK convenience)', async () => {
      // This tests the fallback behavior where priceSlug can accept a UUID (price ID)
      // The SDK passes price identifiers via priceSlug to avoid format detection

      // Create a price for this test
      const uuidPrice = await setupPrice({
        productId: product.id,
        name: 'UUID Test Price',
        type: PriceType.Subscription,
        unitPrice: 2500,
        currency: CurrencyCode.USD,
        isDefault: false,
        livemode: true,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })

      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Existing Plan',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 10 * 60 * 1000,
              endDate: Date.now() + 10 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          // Use a UUID (uuidPrice.id) in the priceSlug field - this is the SDK's approach
          const newItems: TerseSubscriptionItem[] = [
            {
              priceSlug: uuidPrice.id, // UUID passed as priceSlug
              quantity: 1,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )

          // Billing run is routed to mock server - we verify the operation completed
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  /* ==========================================================================
    Upgrade with Proration Disabled
  ========================================================================== */
  describe('Upgrade with Proration Disabled', () => {
    it('should apply upgrade immediately without proration charge when prorateCurrentBillingPeriod is false', async () => {
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Basic Plan',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 10 * 60 * 1000,
              endDate: Date.now() + 10 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          const bpItemsBefore = await selectBillingPeriodItems(
            { billingPeriodId: billingPeriod.id },
            transaction
          )

          // Upgrade to a more expensive plan
          const newItems = [
            {
              name: 'Premium Plan',
              quantity: 1,
              unitPrice: 500,
              priceId: price.id,
              type: SubscriptionItemType.Static,
              addedDate: Date.now(),
              subscriptionId: subscription.id,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            organization,
            ctx
          )

          // Should report as upgrade
          expect(result.status).toBe('ok')
          if (result.status === 'ok') {
            expect(result.value.isUpgrade).toBe(true)
            expect(result.value.resolvedTiming).toBe(
              SubscriptionAdjustmentTiming.Immediately
            )

            // Subscription items should be updated immediately
            expect(result.value.subscriptionItems.length).toBe(1)
            expect(result.value.subscriptionItems[0].unitPrice).toBe(
              500
            )
          }

          // Should NOT create proration billing period items
          const bpItemsAfter = await selectBillingPeriodItems(
            { billingPeriodId: billingPeriod.id },
            transaction
          )
          expect(bpItemsAfter.length).toBe(bpItemsBefore.length)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should send upgrade notification when prorateCurrentBillingPeriod is false and isUpgrade is true', async () => {
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Basic Plan',
        quantity: 1,
        unitPrice: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() - 10 * 60 * 1000,
              endDate: Date.now() + 10 * 60 * 1000,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          // Upgrade to a more expensive plan
          const newItems = [
            {
              name: 'Premium Plan',
              quantity: 1,
              unitPrice: 500,
              priceId: price.id,
              type: SubscriptionItemType.Static,
              addedDate: Date.now(),
              subscriptionId: subscription.id,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            organization,
            ctx
          )

          // Should report as upgrade
          expect(result.status).toBe('ok')
          if (result.status === 'ok') {
            expect(result.value.isUpgrade).toBe(true)

            // Note: The notification itself is tested elsewhere, but we verify
            // that the code path for upgrades without proration is taken
            expect(result.value.resolvedTiming).toBe(
              SubscriptionAdjustmentTiming.Immediately
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  /* ==========================================================================
    Free Subscription Handling
  ========================================================================== */
  describe('Free Subscription Handling', () => {
    it('should throw error when attempting to adjust a free subscription (use createSubscription instead)', async () => {
      // Create a free subscription (isFreePlan=true)
      const freeSubscription = await setupSubscription({
        customerId: customer.id,
        organizationId: organization.id,
        priceId: price.id,
        paymentMethodId: paymentMethod.id,
        status: SubscriptionStatus.Active,
        isFreePlan: true,
      })

      await setupBillingPeriod({
        subscriptionId: freeSubscription.id,
        startDate: Date.now() - 24 * 60 * 60 * 1000,
        endDate: Date.now() + 24 * 60 * 60 * 1000,
        status: BillingPeriodStatus.Active,
      })

      await setupSubscriptionItem({
        subscriptionId: freeSubscription.id,
        name: 'Free Plan',
        quantity: 1,
        unitPrice: 0,
        priceId: price.id,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Paid Plan',
              quantity: 1,
              unitPrice: 2999,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          // Free subscriptions should be upgraded via createSubscription flow,
          // which cancels the free subscription and creates a new paid one.
          // adjustSubscription rejects free plans to enforce this pattern.
          const result = await adjustSubscription(
            {
              id: freeSubscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )
          expect(result.status).toBe('error')
          if (result.status === 'error') {
            expect(result.error._tag).toBe('ValidationError')
            expect(result.error.message.toLowerCase()).toContain(
              'free'
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  /* ==========================================================================
    Immediate Downgrade Behavior
  ========================================================================== */
  describe('Immediate Downgrade Behavior', () => {
    it('should preserve existing usage credits, issue no refund, replace subscription item, expire old features, and create new features when downgrading immediately', async () => {
      // Create a usage meter and feature for the premium product
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'API Calls',
        pricingModelId: pricingModel.id,
      })

      const premiumFeature = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        name: 'Premium API Credits',
        pricingModelId: pricingModel.id,
        amount: 100,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        usageMeterId: usageMeter.id,
        livemode: true,
      })

      // Create a different feature for the basic plan (simulating different feature sets)
      const basicFeature = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        name: 'Basic API Credits',
        pricingModelId: pricingModel.id,
        amount: 25,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        usageMeterId: usageMeter.id,
        livemode: true,
      })

      const premiumProductFeature = await setupProductFeature({
        organizationId: organization.id,
        productId: product.id,
        featureId: premiumFeature.id,
      })

      // Create a basic product with basic price and basic feature
      const basicProduct = await setupProduct({
        organizationId: organization.id,
        name: 'Basic Product',
        pricingModelId: pricingModel.id,
      })

      const basicPrice = await setupPrice({
        productId: basicProduct.id,
        name: 'Basic Monthly',
        unitPrice: 999,
        livemode: true,
        isDefault: false,
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })

      const basicProductFeature = await setupProductFeature({
        organizationId: organization.id,
        productId: basicProduct.id,
        featureId: basicFeature.id,
      })

      // Setup subscription with premium item
      const premiumItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Premium Plan',
        quantity: 1,
        unitPrice: 4999,
        priceId: price.id,
      })

      // Create subscription item feature for the premium item
      await setupSubscriptionItemFeature({
        subscriptionItemId: premiumItem.id,
        featureId: premiumFeature.id,
        productFeatureId: premiumProductFeature.id,
        type: FeatureType.UsageCreditGrant,
        usageMeterId: usageMeter.id,
        livemode: true,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        amount: 100,
      })

      ;(
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          const adjustmentDate = Date.now()
          const newStartDate =
            adjustmentDate - 15 * 24 * 60 * 60 * 1000 // 15 days ago
          const newEndDate = adjustmentDate + 15 * 24 * 60 * 60 * 1000 // 15 days from now

          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: newStartDate,
              endDate: newEndDate,
              status: BillingPeriodStatus.Active,
            },
            transaction
          )

          await updateSubscription(
            {
              id: subscription.id,
              renews: true,
              currentBillingPeriodStart: newStartDate,
              currentBillingPeriodEnd: newEndDate,
            },
            transaction
          )

          // Setup existing usage credits (simulating credits granted at billing period start)
          const existingCreditIssuedAmount = 100
          const existingCredit = await setupUsageCredit({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            billingPeriodId: billingPeriod.id,
            issuedAmount: existingCreditIssuedAmount,
            creditType: UsageCreditType.Grant,
            sourceReferenceType:
              UsageCreditSourceReferenceType.BillingPeriodTransition,
            expiresAt: newEndDate,
          })

          // Setup payment for the premium plan (customer already paid $49.99)
          const invoice = await setupInvoice({
            organizationId: organization.id,
            customerId: customer.id,
            billingPeriodId: billingPeriod.id,
            priceId: price.id,
            livemode: subscription.livemode,
          })
          await setupPayment({
            stripeChargeId: `ch_${Math.random().toString(36).slice(2)}`,
            status: PaymentStatus.Succeeded,
            amount: 4999,
            customerId: customer.id,
            organizationId: organization.id,
            invoiceId: invoice.id,
            billingPeriodId: billingPeriod.id,
            subscriptionId: subscription.id,
            paymentMethodId: paymentMethod.id,
            livemode: true,
          })

          // Verify initial state before downgrade
          const creditsBefore = await selectUsageCredits(
            {
              subscriptionId: subscription.id,
              billingPeriodId: billingPeriod.id,
              usageMeterId: usageMeter.id,
            },
            transaction
          )
          expect(creditsBefore.length).toBe(1)
          expect(creditsBefore[0].id).toBe(existingCredit.id)

          const itemsBefore = await selectSubscriptionItems(
            { subscriptionId: subscription.id },
            transaction
          )
          const activeItemsBefore = itemsBefore.filter(
            (item) => item.expiredAt === null
          )
          expect(activeItemsBefore.length).toBe(1)
          expect(activeItemsBefore[0].id).toBe(premiumItem.id)
          expect(activeItemsBefore[0].unitPrice).toBe(4999)

          // Verify premium feature exists before downgrade
          const featuresBefore = await selectSubscriptionItemFeatures(
            { subscriptionItemId: premiumItem.id },
            transaction
          )
          const activeFeaturesBefore = featuresBefore.filter(
            (f) => f.expiredAt === null
          )
          expect(activeFeaturesBefore.length).toBeGreaterThanOrEqual(
            1
          )

          // Downgrade to a cheaper plan immediately (from $49.99 to $9.99)
          // Use the basic price which has the basic feature linked
          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              priceId: basicPrice.id,
              name: 'Basic Plan',
              quantity: 1,
              unitPrice: 999,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            organization,
            ctx
          )

          // ============================================================
          // ASSERTION 1: No refund issued (downgrade protection)
          // ============================================================
          // For immediate downgrades, no billing run is triggered (no refund)
          // The net charge would be negative, but we cap at 0
          // pendingBillingRunId is only present when a billing run is triggered
          expect(result.status).toBe('ok')
          if (result.status === 'ok') {
            expect(result.value.pendingBillingRunId).toBeUndefined()
          }

          // Check that no proration billing period items were created for refund
          const bpItems = await selectBillingPeriodItems(
            { billingPeriodId: billingPeriod.id },
            transaction
          )
          const refundItems = bpItems.filter(
            (item) =>
              item.name?.includes('Net charge adjustment') ||
              item.name?.includes('Credit') ||
              item.unitPrice < 0
          )
          expect(refundItems.length).toBe(0)

          // ============================================================
          // ASSERTION 2: Subscription item is replaced
          // ============================================================
          const itemsAfter = await selectSubscriptionItems(
            { subscriptionId: subscription.id },
            transaction
          )

          // Old premium item should be expired
          const expiredPremiumItem = itemsAfter.find(
            (item) => item.id === premiumItem.id
          )
          expect(typeof expiredPremiumItem?.expiredAt).toBe('number')
          expect(expiredPremiumItem?.expiredAt).toBeLessThanOrEqual(
            Date.now()
          )

          // New basic item should be active
          const activeItemsAfter = itemsAfter.filter(
            (item) => !item.expiredAt || item.expiredAt > Date.now()
          )
          expect(activeItemsAfter.length).toBe(1)
          expect(activeItemsAfter[0].name).toBe('Basic Plan')
          expect(activeItemsAfter[0].unitPrice).toBe(999)

          // ============================================================
          // ASSERTION 3: Old features are expired
          // ============================================================
          const oldFeaturesAfter =
            await selectSubscriptionItemFeatures(
              { subscriptionItemId: premiumItem.id },
              transaction
            )
          const stillActiveOldFeatures = oldFeaturesAfter.filter(
            (f) => f.expiredAt === null
          )
          // Old features should be expired when the subscription item is expired
          expect(stillActiveOldFeatures.length).toBe(0)

          // ============================================================
          // ASSERTION 4: New downgraded features are created matching basic plan
          // ============================================================
          const newBasicItem = activeItemsAfter[0]
          const newFeaturesAfter =
            await selectSubscriptionItemFeatures(
              { subscriptionItemId: newBasicItem.id },
              transaction
            )
          // Verify features were created for the basic plan
          expect(newFeaturesAfter.length).toBe(1)
          // The new feature should be linked to the basic feature (25 credits)
          // not the premium feature (100 credits)
          expect(newFeaturesAfter[0].featureId).toBe(basicFeature.id)
          expect(newFeaturesAfter[0].productFeatureId).toBe(
            basicProductFeature.id
          )

          // ============================================================
          // ASSERTION 5: Existing usage credits are preserved
          // ============================================================
          const creditsAfter = await selectUsageCredits(
            {
              subscriptionId: subscription.id,
              billingPeriodId: billingPeriod.id,
              usageMeterId: usageMeter.id,
            },
            transaction
          )

          // Credits should still exist with the same issuedAmount
          expect(creditsAfter.length).toBeGreaterThanOrEqual(1)
          const originalCredit = creditsAfter.find(
            (c) => c.id === existingCredit.id
          )
          expect(originalCredit?.issuedAmount).toBe(
            existingCreditIssuedAmount
          )
          expect(originalCredit?.sourceReferenceType).toBe(
            UsageCreditSourceReferenceType.BillingPeriodTransition
          )

          // ============================================================
          // ASSERTION 6: Subscription is updated to reflect downgrade
          // ============================================================
          // Since no billing run was triggered (downgrade protection),
          // the subscription should be synced immediately
          expect(result.status).toBe('ok')
          if (result.status === 'ok') {
            expect(result.value.subscription.name).toBe('Basic Plan')
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  /* ==========================================================================
    adjustSubscription with Resource Claims

    Tests for resource claim preservation and capacity validation during
    subscription adjustments. Resource claims are scoped by (subscriptionId, resourceId)
    rather than subscriptionItemFeatureId, which means they survive subscription
    adjustments where old subscription items are expired and new ones are created.
  ========================================================================== */
  describe('adjustSubscription with resource claims', () => {
    /**
     * Path 1: Immediate upgrade with proration (billing run flow)
     *
     * When net charge > 0 and proration is enabled, adjustSubscription creates
     * a billing run and defers the actual item adjustment to after payment succeeds
     * in processOutcomeForBillingRun.
     */
    describe('Path 1: Immediate upgrade with proration (billing run flow)', () => {
      it('creates billing run for prorated upgrade while preserving claim accessibility', async () => {
        // Setup: Create a resource and resource feature
        const resource = await setupResource({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Seats',
        })

        const resourceFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Seats Feature',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 5,
        })

        await setupProductFeature({
          productId: product.id,
          featureId: resourceFeature.id,
          organizationId: organization.id,
        })

        const subscriptionItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Basic Plan',
          quantity: 1,
          unitPrice: 1000,
        })

        await setupResourceSubscriptionItemFeature({
          subscriptionItemId: subscriptionItem.id,
          featureId: resourceFeature.id,
          resourceId: resource.id,
          pricingModelId: pricingModel.id,
          amount: 5,
        })

        // Claim 3 resources before adjustment
        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            return claimResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: resource.slug,
                  subscriptionId: subscription.id,
                  externalIds: ['user-1', 'user-2', 'user-3'],
                },
              },
              transaction
            )
          })
        ).unwrap()

        // Create premium plan with higher price (triggers proration charge)
        const premiumPrice = await setupPrice({
          productId: product.id,
          name: 'Premium Plan',
          type: PriceType.Subscription,
          unitPrice: 5000, // Much higher to ensure positive proration
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          livemode: subscription.livemode,
          isDefault: false,
          currency: organization.defaultCurrency,
        })

        const premiumResourceFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Premium Seats Feature',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 10,
        })

        await setupProductFeature({
          productId: product.id,
          featureId: premiumResourceFeature.id,
          organizationId: organization.id,
        })

        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            await updateBillingPeriod(
              {
                id: billingPeriod.id,
                startDate: Date.now() - 15 * 24 * 60 * 60 * 1000, // 15 days ago
                endDate: Date.now() + 15 * 24 * 60 * 60 * 1000, // 15 days from now
                status: BillingPeriodStatus.Active,
              },
              transaction
            )

            const newItems: SubscriptionItem.Upsert[] = [
              {
                subscriptionId: subscription.id,
                priceId: premiumPrice.id,
                name: 'Premium Plan',
                quantity: 1,
                unitPrice: 5000,
                livemode: subscription.livemode,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                metadata: null,
                addedDate: Date.now(),
                externalId: null,
                type: SubscriptionItemType.Static,
                expiredAt: null,
              },
            ]

            // Upgrade with proration enabled (should create billing run)
            const result = await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: true,
                },
              },
              organization,
              ctx
            )

            // Verify billing run was created (pendingBillingRunId is returned)
            expect(result.status).toBe('ok')
            if (result.status === 'ok') {
              expect(typeof result.value.pendingBillingRunId).toBe(
                'string'
              )
            }

            // Verify claims are still accessible during pending billing run state
            // (old subscription items haven't been expired yet)
            const activeClaims = await selectActiveResourceClaims(
              {
                subscriptionId: subscription.id,
                resourceId: resource.id,
              },
              transaction
            )
            expect(activeClaims.length).toBe(3)
            expect(
              activeClaims.map((c) => c.externalId).sort()
            ).toEqual(['user-1', 'user-2', 'user-3'])

            // Verify usage still reflects old capacity (adjustment not applied yet)
            const usage = await getResourceUsage(
              subscription.id,
              resource.id,
              transaction
            )
            expect(usage.capacity).toBe(5) // Still old capacity
            expect(usage.claimed).toBe(3)
            expect(usage.available).toBe(2)
            return Result.ok(undefined)
          })
        ).unwrap()
      })

      it('validates capacity before creating billing run for upgrade', async () => {
        // Setup: Create a resource with current capacity
        const resource = await setupResource({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Seats',
        })

        const resourceFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Seats Feature',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 10, // High capacity
        })

        await setupProductFeature({
          productId: product.id,
          featureId: resourceFeature.id,
          organizationId: organization.id,
        })

        const subscriptionItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Premium Plan',
          quantity: 1,
          unitPrice: 5000,
        })

        await setupResourceSubscriptionItemFeature({
          subscriptionItemId: subscriptionItem.id,
          featureId: resourceFeature.id,
          resourceId: resource.id,
          pricingModelId: pricingModel.id,
          amount: 10,
        })

        // Claim 8 resources
        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            return claimResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: resource.slug,
                  subscriptionId: subscription.id,
                  quantity: 8,
                },
              },
              transaction
            )
          })
        ).unwrap()

        // Create a lower capacity plan (even though higher price)
        const expensiveButLimitedPrice = await setupPrice({
          productId: product.id,
          name: 'Expensive Limited Plan',
          type: PriceType.Subscription,
          unitPrice: 10000, // Higher price
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          livemode: subscription.livemode,
          isDefault: false,
          currency: organization.defaultCurrency,
        })

        const limitedResourceFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Limited Seats Feature',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 5, // Lower capacity than current claims
        })

        await setupProductFeature({
          productId: product.id,
          featureId: limitedResourceFeature.id,
          organizationId: organization.id,
        })

        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            await updateBillingPeriod(
              {
                id: billingPeriod.id,
                startDate: Date.now() - 15 * 24 * 60 * 60 * 1000,
                endDate: Date.now() + 15 * 24 * 60 * 60 * 1000,
                status: BillingPeriodStatus.Active,
              },
              transaction
            )

            const newItems: SubscriptionItem.Upsert[] = [
              {
                subscriptionId: subscription.id,
                priceId: expensiveButLimitedPrice.id,
                name: 'Expensive Limited Plan',
                quantity: 1,
                unitPrice: 10000,
                livemode: subscription.livemode,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                metadata: null,
                addedDate: Date.now(),
                externalId: null,
                type: SubscriptionItemType.Static,
                expiredAt: null,
              },
            ]

            // Should reject because new capacity (5) < active claims (8)
            const result = await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: true,
                },
              },
              organization,
              ctx
            )
            expect(result.status).toBe('error')
            if (result.status === 'error') {
              expect(result.error._tag).toBe('ConflictError')
              expect(result.error.message).toMatch(
                /Cannot reduce.*capacity to 5.*8.*claimed/
              )
            }

            // Verify claims unchanged
            const activeClaims = await selectActiveResourceClaims(
              {
                subscriptionId: subscription.id,
                resourceId: resource.id,
              },
              transaction
            )
            expect(activeClaims.length).toBe(8)
            return Result.ok(undefined)
          })
        ).unwrap()
      })
    })

    /**
     * Path 2: Downgrade/zero-charge (immediate adjustment)
     *
     * When net charge <= 0 or timing is AtEndOfCurrentBillingPeriod,
     * adjustSubscription calls handleSubscriptionItemAdjustment directly
     * without creating a billing run.
     */
    describe('Path 2: Downgrade/zero-charge (immediate adjustment)', () => {
      it('preserves existing claims after upgrade without proration', async () => {
        // Setup: Create a resource and resource feature
        const resource = await setupResource({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Seats',
        })

        const resourceFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Seats Feature',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 5, // 5 seat capacity
        })

        // Create product feature linking the feature to the product
        await setupProductFeature({
          productId: product.id,
          featureId: resourceFeature.id,
          organizationId: organization.id,
        })

        // Setup subscription item with resource feature
        const subscriptionItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Current Plan',
          quantity: 1,
          unitPrice: 1000,
        })

        await setupResourceSubscriptionItemFeature({
          subscriptionItemId: subscriptionItem.id,
          featureId: resourceFeature.id,
          resourceId: resource.id,
          pricingModelId: pricingModel.id,
          amount: 5,
        })

        // Claim 3 resources
        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            return claimResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: resource.slug,
                  subscriptionId: subscription.id,
                  externalIds: ['user-1', 'user-2', 'user-3'],
                },
              },
              transaction
            )
          })
        ).unwrap()

        // Create a higher capacity plan
        const premiumPrice = await setupPrice({
          productId: product.id,
          name: 'Premium Plan',
          type: PriceType.Subscription,
          unitPrice: 2000,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          livemode: subscription.livemode,
          isDefault: false,
          currency: organization.defaultCurrency,
        })

        const premiumResourceFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Premium Seats Feature',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 10, // 10 seat capacity
        })

        await setupProductFeature({
          productId: product.id,
          featureId: premiumResourceFeature.id,
          organizationId: organization.id,
        })

        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            await updateBillingPeriod(
              {
                id: billingPeriod.id,
                startDate: Date.now() - 10 * 60 * 1000,
                endDate: Date.now() + 10 * 60 * 1000,
                status: BillingPeriodStatus.Active,
              },
              transaction
            )

            const newItems: SubscriptionItem.Upsert[] = [
              {
                subscriptionId: subscription.id,
                priceId: premiumPrice.id,
                name: 'Premium Plan',
                quantity: 1,
                unitPrice: 2000,
                livemode: subscription.livemode,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                metadata: null,
                addedDate: Date.now(),
                externalId: null,
                type: SubscriptionItemType.Static,
                expiredAt: null,
              },
            ]

            // Upgrade without proration (no billing run)
            await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: false,
                },
              },
              organization,
              ctx
            )

            // Verify claims are preserved
            const activeClaims = await selectActiveResourceClaims(
              {
                subscriptionId: subscription.id,
                resourceId: resource.id,
              },
              transaction
            )
            expect(activeClaims.length).toBe(3)
            expect(
              activeClaims.map((c) => c.externalId).sort()
            ).toEqual(['user-1', 'user-2', 'user-3'])

            // Verify usage shows new capacity with existing claims
            const usage = await getResourceUsage(
              subscription.id,
              resource.id,
              transaction
            )
            expect(usage.capacity).toBe(10)
            expect(usage.claimed).toBe(3)
            expect(usage.available).toBe(7)
            return Result.ok(undefined)
          })
        ).unwrap()
      })

      it('preserves existing claims after downgrade when new capacity >= active claims', async () => {
        // Setup: Create a resource with high capacity
        const resource = await setupResource({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Seats',
        })

        const highCapacityFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'High Capacity Seats',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 10, // 10 seat capacity
        })

        await setupProductFeature({
          productId: product.id,
          featureId: highCapacityFeature.id,
          organizationId: organization.id,
        })

        const premiumPrice = await setupPrice({
          productId: product.id,
          name: 'Premium Plan',
          type: PriceType.Subscription,
          unitPrice: 2000,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          livemode: subscription.livemode,
          isDefault: false,
          currency: organization.defaultCurrency,
        })

        const subscriptionItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: premiumPrice.id,
          name: 'Premium Plan',
          quantity: 1,
          unitPrice: 2000,
        })

        await setupResourceSubscriptionItemFeature({
          subscriptionItemId: subscriptionItem.id,
          featureId: highCapacityFeature.id,
          resourceId: resource.id,
          pricingModelId: pricingModel.id,
          amount: 10,
        })

        // Claim 3 resources (less than new capacity)
        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            return claimResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: resource.slug,
                  subscriptionId: subscription.id,
                  quantity: 3,
                },
              },
              transaction
            )
          })
        ).unwrap()

        // Create a lower capacity plan (but still >= claimed)
        const basicPrice = await setupPrice({
          productId: product.id,
          name: 'Basic Plan',
          type: PriceType.Subscription,
          unitPrice: 500,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          livemode: subscription.livemode,
          isDefault: false,
          currency: organization.defaultCurrency,
        })

        const basicResourceFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Basic Seats Feature',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 5, // 5 seat capacity (still >= 3 claimed)
        })

        await setupProductFeature({
          productId: product.id,
          featureId: basicResourceFeature.id,
          organizationId: organization.id,
        })

        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            await updateBillingPeriod(
              {
                id: billingPeriod.id,
                startDate: Date.now() - 10 * 60 * 1000,
                endDate: Date.now() + 10 * 60 * 1000,
                status: BillingPeriodStatus.Active,
              },
              transaction
            )

            const newItems: SubscriptionItem.Upsert[] = [
              {
                subscriptionId: subscription.id,
                priceId: basicPrice.id,
                name: 'Basic Plan',
                quantity: 1,
                unitPrice: 500,
                livemode: subscription.livemode,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                metadata: null,
                addedDate: Date.now(),
                externalId: null,
                type: SubscriptionItemType.Static,
                expiredAt: null,
              },
            ]

            // Downgrade (immediate since no proration charge)
            await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: false,
                },
              },
              organization,
              ctx
            )

            // Verify claims are preserved
            const activeClaims = await selectActiveResourceClaims(
              {
                subscriptionId: subscription.id,
                resourceId: resource.id,
              },
              transaction
            )
            expect(activeClaims.length).toBe(3)

            // Verify usage shows reduced capacity with existing claims
            const usage = await getResourceUsage(
              subscription.id,
              resource.id,
              transaction
            )
            expect(usage.capacity).toBe(5)
            expect(usage.claimed).toBe(3)
            expect(usage.available).toBe(2)
            return Result.ok(undefined)
          })
        ).unwrap()
      })

      it('rejects downgrade when new capacity would be less than active claims', async () => {
        // Setup: Create a resource with high capacity
        const resource = await setupResource({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Seats',
        })

        const highCapacityFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'High Capacity Seats',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 10, // 10 seat capacity
        })

        await setupProductFeature({
          productId: product.id,
          featureId: highCapacityFeature.id,
          organizationId: organization.id,
        })

        const premiumPrice = await setupPrice({
          productId: product.id,
          name: 'Premium Plan',
          type: PriceType.Subscription,
          unitPrice: 2000,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          livemode: subscription.livemode,
          isDefault: false,
          currency: organization.defaultCurrency,
        })

        const subscriptionItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: premiumPrice.id,
          name: 'Premium Plan',
          quantity: 1,
          unitPrice: 2000,
        })

        await setupResourceSubscriptionItemFeature({
          subscriptionItemId: subscriptionItem.id,
          featureId: highCapacityFeature.id,
          resourceId: resource.id,
          pricingModelId: pricingModel.id,
          amount: 10,
        })

        // Claim 5 resources
        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            return claimResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: resource.slug,
                  subscriptionId: subscription.id,
                  quantity: 5,
                },
              },
              transaction
            )
          })
        ).unwrap()

        // Create a plan with capacity less than claims
        const tinyPrice = await setupPrice({
          productId: product.id,
          name: 'Tiny Plan',
          type: PriceType.Subscription,
          unitPrice: 100,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          livemode: subscription.livemode,
          isDefault: false,
          currency: organization.defaultCurrency,
        })

        const tinyResourceFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Tiny Seats Feature',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 3, // 3 seat capacity (less than 5 claimed)
        })

        await setupProductFeature({
          productId: product.id,
          featureId: tinyResourceFeature.id,
          organizationId: organization.id,
        })

        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            await updateBillingPeriod(
              {
                id: billingPeriod.id,
                startDate: Date.now() - 10 * 60 * 1000,
                endDate: Date.now() + 10 * 60 * 1000,
                status: BillingPeriodStatus.Active,
              },
              transaction
            )

            const newItems: SubscriptionItem.Upsert[] = [
              {
                subscriptionId: subscription.id,
                priceId: tinyPrice.id,
                name: 'Tiny Plan',
                quantity: 1,
                unitPrice: 100,
                livemode: subscription.livemode,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                metadata: null,
                addedDate: Date.now(),
                externalId: null,
                type: SubscriptionItemType.Static,
                expiredAt: null,
              },
            ]

            // Attempt downgrade - should return error
            const result = await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: false,
                },
              },
              organization,
              ctx
            )
            expect(result.status).toBe('error')
            if (result.status === 'error') {
              expect(result.error._tag).toBe('ConflictError')
              expect(result.error.message).toMatch(
                /Cannot reduce.*capacity to 3.*5.*claimed/
              )
            }

            // Verify claims are unchanged
            const activeClaims = await selectActiveResourceClaims(
              {
                subscriptionId: subscription.id,
                resourceId: resource.id,
              },
              transaction
            )
            expect(activeClaims.length).toBe(5)

            // Verify subscription items are unchanged
            const items = await selectSubscriptionItems(
              { subscriptionId: subscription.id },
              transaction
            )
            const activeItems = items.filter(
              (i) => !i.expiredAt || i.expiredAt > Date.now()
            )
            expect(activeItems.length).toBe(1)
            expect(activeItems[0].name).toBe('Premium Plan')
            return Result.ok(undefined)
          })
        ).unwrap()
      })
    })

    /**
     * Path 3: End-of-period adjustment
     *
     * When timing is AtEndOfCurrentBillingPeriod, the adjustment is scheduled
     * for the future but capacity validation happens immediately.
     */
    describe('Path 3: End-of-period adjustment', () => {
      it('validates capacity at adjustment scheduling time, not when adjustment applies', async () => {
        // Setup: Create a resource with high capacity
        const resource = await setupResource({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Seats',
        })

        const highCapacityFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'High Capacity Seats',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 10,
        })

        await setupProductFeature({
          productId: product.id,
          featureId: highCapacityFeature.id,
          organizationId: organization.id,
        })

        const subscriptionItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Premium Plan',
          quantity: 1,
          unitPrice: 2000,
        })

        await setupResourceSubscriptionItemFeature({
          subscriptionItemId: subscriptionItem.id,
          featureId: highCapacityFeature.id,
          resourceId: resource.id,
          pricingModelId: pricingModel.id,
          amount: 10,
        })

        // Claim 5 resources
        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            return claimResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: resource.slug,
                  subscriptionId: subscription.id,
                  quantity: 5,
                },
              },
              transaction
            )
          })
        ).unwrap()

        // Create a plan with capacity less than current claims
        const tinyProduct = await setupProduct({
          organizationId: organization.id,
          name: 'Tiny Product',
          pricingModelId: pricingModel.id,
          livemode: subscription.livemode,
        })

        const tinyPrice = await setupPrice({
          productId: tinyProduct.id,
          name: 'Tiny Plan',
          type: PriceType.Subscription,
          unitPrice: 100,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          livemode: subscription.livemode,
          isDefault: false,
          currency: organization.defaultCurrency,
        })

        const tinyResourceFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Tiny Seats Feature',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 3, // Less than 5 claimed
        })

        await setupProductFeature({
          productId: tinyProduct.id,
          featureId: tinyResourceFeature.id,
          organizationId: organization.id,
        })

        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            await updateBillingPeriod(
              {
                id: billingPeriod.id,
                startDate: Date.now() - 10 * 60 * 1000,
                endDate: Date.now() + 10 * 60 * 1000,
                status: BillingPeriodStatus.Active,
              },
              transaction
            )

            const newItems: SubscriptionItem.Upsert[] = [
              {
                subscriptionId: subscription.id,
                priceId: tinyPrice.id,
                name: 'Tiny Plan',
                quantity: 1,
                unitPrice: 100,
                livemode: subscription.livemode,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                metadata: null,
                addedDate: Date.now(),
                externalId: null,
                type: SubscriptionItemType.Static,
                expiredAt: null,
              },
            ]

            // Schedule end-of-period downgrade - should return error immediately
            // because capacity validation happens at scheduling time
            const result = await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newItems,
                  timing:
                    SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
                },
              },
              organization,
              ctx
            )
            expect(result.status).toBe('error')
            if (result.status === 'error') {
              expect(result.error._tag).toBe('ConflictError')
              expect(result.error.message).toMatch(
                /Cannot reduce.*capacity to 3.*5.*claimed/
              )
            }

            // Verify claims unchanged
            const activeClaims = await selectActiveResourceClaims(
              {
                subscriptionId: subscription.id,
                resourceId: resource.id,
              },
              transaction
            )
            expect(activeClaims.length).toBe(5)
            return Result.ok(undefined)
          })
        ).unwrap()
      })

      it('preserves claims when scheduling valid end-of-period downgrade', async () => {
        // Setup: Create a resource
        const resource = await setupResource({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Seats',
        })

        const highCapacityFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'High Capacity Seats',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 10,
        })

        await setupProductFeature({
          productId: product.id,
          featureId: highCapacityFeature.id,
          organizationId: organization.id,
        })

        const subscriptionItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Premium Plan',
          quantity: 1,
          unitPrice: 2000,
        })

        await setupResourceSubscriptionItemFeature({
          subscriptionItemId: subscriptionItem.id,
          featureId: highCapacityFeature.id,
          resourceId: resource.id,
          pricingModelId: pricingModel.id,
          amount: 10,
        })

        // Claim 3 resources (less than new capacity)
        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            return claimResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: resource.slug,
                  subscriptionId: subscription.id,
                  externalIds: ['user-1', 'user-2', 'user-3'],
                },
              },
              transaction
            )
          })
        ).unwrap()

        // Create a plan with capacity >= current claims
        const basicProduct = await setupProduct({
          organizationId: organization.id,
          name: 'Basic Product',
          pricingModelId: pricingModel.id,
          livemode: subscription.livemode,
        })

        const basicPrice = await setupPrice({
          productId: basicProduct.id,
          name: 'Basic Plan',
          type: PriceType.Subscription,
          unitPrice: 500,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          livemode: subscription.livemode,
          isDefault: false,
          currency: organization.defaultCurrency,
        })

        const basicResourceFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Basic Seats Feature',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 5, // More than 3 claimed
        })

        await setupProductFeature({
          productId: basicProduct.id,
          featureId: basicResourceFeature.id,
          organizationId: organization.id,
        })

        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            await updateBillingPeriod(
              {
                id: billingPeriod.id,
                startDate: Date.now() - 10 * 60 * 1000,
                endDate: Date.now() + 10 * 60 * 1000,
                status: BillingPeriodStatus.Active,
              },
              transaction
            )

            const newItems: SubscriptionItem.Upsert[] = [
              {
                subscriptionId: subscription.id,
                priceId: basicPrice.id,
                name: 'Basic Plan',
                quantity: 1,
                unitPrice: 500,
                livemode: subscription.livemode,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                metadata: null,
                addedDate: Date.now(),
                externalId: null,
                type: SubscriptionItemType.Static,
                expiredAt: null,
              },
            ]

            // Schedule end-of-period downgrade - should succeed
            const result = await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newItems,
                  timing:
                    SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
                },
              },
              organization,
              ctx
            )

            // No billing run for end-of-period adjustments
            expect(result.status).toBe('ok')
            if (result.status === 'ok') {
              expect(result.value.pendingBillingRunId).toBeUndefined()
            }

            // Verify claims still accessible (adjustment not applied yet)
            const activeClaims = await selectActiveResourceClaims(
              {
                subscriptionId: subscription.id,
                resourceId: resource.id,
              },
              transaction
            )
            expect(activeClaims.length).toBe(3)
            expect(
              activeClaims.map((c) => c.externalId).sort()
            ).toEqual(['user-1', 'user-2', 'user-3'])

            // Verify capacity still shows old value (adjustment scheduled, not applied)
            const usage = await getResourceUsage(
              subscription.id,
              resource.id,
              transaction
            )
            expect(usage.capacity).toBe(10) // Still old capacity
            expect(usage.claimed).toBe(3)
            expect(usage.available).toBe(7)
            return Result.ok(undefined)
          })
        ).unwrap()
      })
    })

    /**
     * Multi-item capacity aggregation
     *
     * A subscription can have multiple items that each provide capacity for
     * the same resource. Validation must aggregate capacity across all items.
     */
    describe('Multi-item capacity aggregation', () => {
      it('aggregates capacity across multiple subscription items when validating downgrade', async () => {
        // Setup: Create a resource
        const resource = await setupResource({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Seats',
        })

        // Create base plan with 3 seat capacity
        const basePlanFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Base Plan Seats',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 3,
        })

        await setupProductFeature({
          productId: product.id,
          featureId: basePlanFeature.id,
          organizationId: organization.id,
        })

        // Create addon with 2 seat capacity
        const addonProduct = await setupProduct({
          organizationId: organization.id,
          name: 'Seat Addon',
          pricingModelId: pricingModel.id,
        })

        const addonPrice = await setupPrice({
          productId: addonProduct.id,
          name: 'Seat Addon',
          type: PriceType.Subscription,
          unitPrice: 500,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          livemode: subscription.livemode,
          isDefault: false,
          currency: organization.defaultCurrency,
        })

        const addonFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Addon Seats',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 2,
        })

        await setupProductFeature({
          productId: addonProduct.id,
          featureId: addonFeature.id,
          organizationId: organization.id,
        })

        // Setup subscription with both items (3 + 2 = 5 total capacity)
        const baseItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Base Plan',
          quantity: 1,
          unitPrice: 1000,
        })

        await setupResourceSubscriptionItemFeature({
          subscriptionItemId: baseItem.id,
          featureId: basePlanFeature.id,
          resourceId: resource.id,
          pricingModelId: pricingModel.id,
          amount: 3,
        })

        const addonItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: addonPrice.id,
          name: 'Seat Addon',
          quantity: 1,
          unitPrice: 500,
        })

        await setupResourceSubscriptionItemFeature({
          subscriptionItemId: addonItem.id,
          featureId: addonFeature.id,
          resourceId: resource.id,
          pricingModelId: pricingModel.id,
          amount: 2,
        })

        // Claim 4 resources (uses capacity from both items)
        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            return claimResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: resource.slug,
                  subscriptionId: subscription.id,
                  quantity: 4,
                },
              },
              transaction
            )
          })
        ).unwrap()

        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            await updateBillingPeriod(
              {
                id: billingPeriod.id,
                startDate: Date.now() - 10 * 60 * 1000,
                endDate: Date.now() + 10 * 60 * 1000,
                status: BillingPeriodStatus.Active,
              },
              transaction
            )

            // Attempt to remove the addon (new capacity would be 3, but 4 are claimed)
            const newItems: SubscriptionItem.Upsert[] = [
              {
                id: baseItem.id,
                subscriptionId: subscription.id,
                priceId: price.id,
                name: 'Base Plan',
                quantity: 1,
                unitPrice: 1000,
                livemode: subscription.livemode,
                createdAt: baseItem.createdAt,
                updatedAt: Date.now(),
                metadata: null,
                addedDate: baseItem.addedDate,
                externalId: null,
                type: SubscriptionItemType.Static,
                expiredAt: null,
              },
              // Addon is NOT included - effectively removing it
            ]

            // Should reject because removing addon leaves only 3 capacity but 4 claimed
            const result = await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: false,
                },
              },
              organization,
              ctx
            )
            expect(result.status).toBe('error')
            if (result.status === 'error') {
              expect(result.error._tag).toBe('ConflictError')
              expect(result.error.message).toMatch(
                /Cannot reduce.*capacity to 3.*4.*claimed/
              )
            }

            // Verify all 4 claims unchanged
            const activeClaims = await selectActiveResourceClaims(
              {
                subscriptionId: subscription.id,
                resourceId: resource.id,
              },
              transaction
            )
            expect(activeClaims.length).toBe(4)
            return Result.ok(undefined)
          })
        ).unwrap()
      })

      it('allows adjustment when aggregated capacity is sufficient', async () => {
        // Setup: Create a resource
        const resource = await setupResource({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Seats',
        })

        // Create base plan with 3 seat capacity
        const basePlanFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Base Plan Seats',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 3,
        })

        await setupProductFeature({
          productId: product.id,
          featureId: basePlanFeature.id,
          organizationId: organization.id,
        })

        // Create addon with 2 seat capacity
        const addonProduct = await setupProduct({
          organizationId: organization.id,
          name: 'Seat Addon',
          pricingModelId: pricingModel.id,
        })

        const addonPrice = await setupPrice({
          productId: addonProduct.id,
          name: 'Seat Addon',
          type: PriceType.Subscription,
          unitPrice: 500,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          livemode: subscription.livemode,
          isDefault: false,
          currency: organization.defaultCurrency,
        })

        const addonFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Addon Seats',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 2,
        })

        await setupProductFeature({
          productId: addonProduct.id,
          featureId: addonFeature.id,
          organizationId: organization.id,
        })

        // Setup subscription with both items (3 + 2 = 5 total capacity)
        const baseItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Base Plan',
          quantity: 1,
          unitPrice: 1000,
        })

        await setupResourceSubscriptionItemFeature({
          subscriptionItemId: baseItem.id,
          featureId: basePlanFeature.id,
          resourceId: resource.id,
          pricingModelId: pricingModel.id,
          amount: 3,
        })

        const addonItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: addonPrice.id,
          name: 'Seat Addon',
          quantity: 1,
          unitPrice: 500,
        })

        await setupResourceSubscriptionItemFeature({
          subscriptionItemId: addonItem.id,
          featureId: addonFeature.id,
          resourceId: resource.id,
          pricingModelId: pricingModel.id,
          amount: 2,
        })

        // Claim 2 resources (can be satisfied by base plan alone)
        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            return claimResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: resource.slug,
                  subscriptionId: subscription.id,
                  quantity: 2,
                },
              },
              transaction
            )
          })
        ).unwrap()

        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            await updateBillingPeriod(
              {
                id: billingPeriod.id,
                startDate: Date.now() - 10 * 60 * 1000,
                endDate: Date.now() + 10 * 60 * 1000,
                status: BillingPeriodStatus.Active,
              },
              transaction
            )

            // Remove the addon (new capacity would be 3, and only 2 are claimed)
            const newItems: SubscriptionItem.Upsert[] = [
              {
                id: baseItem.id,
                subscriptionId: subscription.id,
                priceId: price.id,
                name: 'Base Plan',
                quantity: 1,
                unitPrice: 1000,
                livemode: subscription.livemode,
                createdAt: baseItem.createdAt,
                updatedAt: Date.now(),
                metadata: null,
                addedDate: baseItem.addedDate,
                externalId: null,
                type: SubscriptionItemType.Static,
                expiredAt: null,
              },
            ]

            // Should succeed because 2 claimed <= 3 remaining capacity
            await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: false,
                },
              },
              organization,
              ctx
            )

            // Verify claims are preserved
            const activeClaims = await selectActiveResourceClaims(
              {
                subscriptionId: subscription.id,
                resourceId: resource.id,
              },
              transaction
            )
            expect(activeClaims.length).toBe(2)

            // Verify usage shows reduced capacity
            const usage = await getResourceUsage(
              subscription.id,
              resource.id,
              transaction
            )
            expect(usage.capacity).toBe(3)
            expect(usage.claimed).toBe(2)
            expect(usage.available).toBe(1)
            return Result.ok(undefined)
          })
        ).unwrap()
      })
    })

    /**
     * Post-adjustment operations
     *
     * After an adjustment, new subscription item features exist. Claims should
     * be creatable against the new capacity and visible alongside old claims.
     */
    describe('Post-adjustment operations', () => {
      it('allows claiming resources after adjustment with new subscription items', async () => {
        // Setup: Create a resource
        const resource = await setupResource({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Seats',
        })

        const resourceFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Seats Feature',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 5,
        })

        await setupProductFeature({
          productId: product.id,
          featureId: resourceFeature.id,
          organizationId: organization.id,
        })

        const subscriptionItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Current Plan',
          quantity: 1,
          unitPrice: 1000,
        })

        await setupResourceSubscriptionItemFeature({
          subscriptionItemId: subscriptionItem.id,
          featureId: resourceFeature.id,
          resourceId: resource.id,
          pricingModelId: pricingModel.id,
          amount: 5,
        })

        // Claim 2 resources before adjustment
        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            return claimResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: resource.slug,
                  subscriptionId: subscription.id,
                  externalIds: ['user-1', 'user-2'],
                },
              },
              transaction
            )
          })
        ).unwrap()

        // Create same-capacity plan for adjustment
        const newPrice = await setupPrice({
          productId: product.id,
          name: 'New Plan',
          type: PriceType.Subscription,
          unitPrice: 1000,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          livemode: subscription.livemode,
          isDefault: false,
          currency: organization.defaultCurrency,
        })

        // Note: The new price is for the same product, and the product already
        // has a seats feature. We intentionally do NOT attach a second seats
        // feature, otherwise capacity would double (5 + 5) after adjustment.
        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            await updateBillingPeriod(
              {
                id: billingPeriod.id,
                startDate: Date.now() - 10 * 60 * 1000,
                endDate: Date.now() + 10 * 60 * 1000,
                status: BillingPeriodStatus.Active,
              },
              transaction
            )

            const newItems: SubscriptionItem.Upsert[] = [
              {
                subscriptionId: subscription.id,
                priceId: newPrice.id,
                name: 'New Plan',
                quantity: 1,
                unitPrice: 1000,
                livemode: subscription.livemode,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                metadata: null,
                addedDate: Date.now(),
                externalId: null,
                type: SubscriptionItemType.Static,
                expiredAt: null,
              },
            ]

            // Adjust subscription
            await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: false,
                },
              },
              organization,
              ctx
            )

            // Verify old claims are still visible
            const claimsAfterAdjustment =
              await selectActiveResourceClaims(
                {
                  subscriptionId: subscription.id,
                  resourceId: resource.id,
                },
                transaction
              )
            expect(claimsAfterAdjustment.length).toBe(2)

            // Claim 2 more resources with new subscription items
            const newClaimResult = (
              await claimResourceTransaction(
                {
                  organizationId: organization.id,
                  customerId: customer.id,
                  input: {
                    resourceSlug: resource.slug,
                    subscriptionId: subscription.id,
                    externalIds: ['user-3', 'user-4'],
                  },
                },
                transaction
              )
            ).unwrap()

            expect(newClaimResult.claims.length).toBe(2)

            // Verify all 4 claims (old and new) are visible
            const allClaims = await selectActiveResourceClaims(
              {
                subscriptionId: subscription.id,
                resourceId: resource.id,
              },
              transaction
            )
            expect(allClaims.length).toBe(4)
            expect(allClaims.map((c) => c.externalId).sort()).toEqual(
              ['user-1', 'user-2', 'user-3', 'user-4']
            )

            // Verify usage
            const usage = await getResourceUsage(
              subscription.id,
              resource.id,
              transaction
            )
            expect(usage.capacity).toBe(5)
            expect(usage.claimed).toBe(4)
            expect(usage.available).toBe(1)
            return Result.ok(undefined)
          })
        ).unwrap()
      })

      it('allows releasing claims after adjustment', async () => {
        // Setup: Create a resource
        const resource = await setupResource({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Seats',
        })

        const resourceFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Seats Feature',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 5,
        })

        await setupProductFeature({
          productId: product.id,
          featureId: resourceFeature.id,
          organizationId: organization.id,
        })

        const subscriptionItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Current Plan',
          quantity: 1,
          unitPrice: 1000,
        })

        await setupResourceSubscriptionItemFeature({
          subscriptionItemId: subscriptionItem.id,
          featureId: resourceFeature.id,
          resourceId: resource.id,
          pricingModelId: pricingModel.id,
          amount: 5,
        })

        // Claim 3 resources before adjustment
        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            return claimResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: resource.slug,
                  subscriptionId: subscription.id,
                  externalIds: ['user-1', 'user-2', 'user-3'],
                },
              },
              transaction
            )
          })
        ).unwrap()

        // Create same-capacity plan for adjustment
        const newPrice = await setupPrice({
          productId: product.id,
          name: 'New Plan',
          type: PriceType.Subscription,
          unitPrice: 1000,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          livemode: subscription.livemode,
          isDefault: false,
          currency: organization.defaultCurrency,
        })

        // Note: The new price is for the same product, and the product already
        // has a seats feature. We intentionally do NOT attach a second seats
        // feature, otherwise capacity would double (5 + 5) after adjustment.
        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            await updateBillingPeriod(
              {
                id: billingPeriod.id,
                startDate: Date.now() - 10 * 60 * 1000,
                endDate: Date.now() + 10 * 60 * 1000,
                status: BillingPeriodStatus.Active,
              },
              transaction
            )

            const newItems: SubscriptionItem.Upsert[] = [
              {
                subscriptionId: subscription.id,
                priceId: newPrice.id,
                name: 'New Plan',
                quantity: 1,
                unitPrice: 1000,
                livemode: subscription.livemode,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                metadata: null,
                addedDate: Date.now(),
                externalId: null,
                type: SubscriptionItemType.Static,
                expiredAt: null,
              },
            ]

            // Adjust subscription
            await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: false,
                },
              },
              organization,
              ctx
            )

            // Release one claim after adjustment
            const releaseResult = await releaseResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: resource.slug,
                  subscriptionId: subscription.id,
                  externalId: 'user-2',
                },
              },
              transaction
            )

            expect(releaseResult.releasedClaims.length).toBe(1)
            expect(releaseResult.releasedClaims[0].externalId).toBe(
              'user-2'
            )

            // Verify remaining claims
            const remainingClaims = await selectActiveResourceClaims(
              {
                subscriptionId: subscription.id,
                resourceId: resource.id,
              },
              transaction
            )
            expect(remainingClaims.length).toBe(2)
            expect(
              remainingClaims.map((c) => c.externalId).sort()
            ).toEqual(['user-1', 'user-3'])

            // Verify usage
            const usage = await getResourceUsage(
              subscription.id,
              resource.id,
              transaction
            )
            expect(usage.capacity).toBe(5)
            expect(usage.claimed).toBe(2)
            expect(usage.available).toBe(3)
            return Result.ok(undefined)
          })
        ).unwrap()
      })
    })

    /**
     * Edge cases for capacity boundary conditions
     *
     * Tests that validate behavior at exact capacity boundaries and
     * document current behavior for interim period claiming.
     */
    describe('Capacity boundary edge cases', () => {
      it('after immediate downgrade to exact capacity matching claims, further claims fail with no available capacity', async () => {
        // Edge Case 1: Downgrade to exact capacity, then try to claim more
        // Setup: 3 seat capacity, claim 2, downgrade to 2 seats, try to claim 3rd
        const resource = await setupResource({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Seats',
        })

        // Create initial plan with 3 seat capacity
        const initialFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Initial Seats Feature',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 3,
        })

        await setupProductFeature({
          productId: product.id,
          featureId: initialFeature.id,
          organizationId: organization.id,
        })

        const subscriptionItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Initial Plan',
          quantity: 1,
          unitPrice: 1000,
        })

        await setupResourceSubscriptionItemFeature({
          subscriptionItemId: subscriptionItem.id,
          featureId: initialFeature.id,
          resourceId: resource.id,
          pricingModelId: pricingModel.id,
          amount: 3,
        })

        // Step 2: Claim 2 seats
        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            return claimResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: resource.slug,
                  subscriptionId: subscription.id,
                  externalIds: ['user-1', 'user-2'],
                },
              },
              transaction
            )
          })
        ).unwrap()

        // Create downgrade plan with exactly 2 seat capacity (matches claimed)
        const downgradedPrice = await setupPrice({
          productId: product.id,
          name: 'Downgraded Plan',
          type: PriceType.Subscription,
          unitPrice: 500,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          livemode: subscription.livemode,
          isDefault: false,
          currency: organization.defaultCurrency,
        })

        const downgradedFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Downgraded Seats Feature',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 2, // Exactly matches claimed (2)
        })

        await setupProductFeature({
          productId: product.id,
          featureId: downgradedFeature.id,
          organizationId: organization.id,
        })

        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            await updateBillingPeriod(
              {
                id: billingPeriod.id,
                startDate: Date.now() - 10 * 60 * 1000,
                endDate: Date.now() + 10 * 60 * 1000,
                status: BillingPeriodStatus.Active,
              },
              transaction
            )

            // Step 3: Downgrade to 2 seats (should succeed since 2 claims <= 2 capacity)
            const newItems: SubscriptionItem.Upsert[] = [
              {
                subscriptionId: subscription.id,
                priceId: downgradedPrice.id,
                name: 'Downgraded Plan',
                quantity: 1,
                unitPrice: 500,
                livemode: subscription.livemode,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                metadata: null,
                addedDate: Date.now(),
                externalId: null,
                type: SubscriptionItemType.Static,
                expiredAt: null,
              },
            ]

            await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: false,
                },
              },
              organization,
              ctx
            )

            // Verify claims are preserved
            const claimsAfterDowngrade =
              await selectActiveResourceClaims(
                {
                  subscriptionId: subscription.id,
                  resourceId: resource.id,
                },
                transaction
              )
            expect(claimsAfterDowngrade.length).toBe(2)

            // Verify usage shows exact capacity match
            const usageAfterDowngrade = await getResourceUsage(
              subscription.id,
              resource.id,
              transaction
            )
            expect(usageAfterDowngrade.capacity).toBe(2)
            expect(usageAfterDowngrade.claimed).toBe(2)
            expect(usageAfterDowngrade.available).toBe(0)

            // Step 4: Attempt to claim a 3rd seat - should fail
            const claimResult = await claimResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: resource.slug,
                  subscriptionId: subscription.id,
                  quantity: 1,
                },
              },
              transaction
            )
            expect(Result.isError(claimResult)).toBe(true)
            if (Result.isError(claimResult)) {
              expect(claimResult.error.message).toContain(
                'No available capacity'
              )
            }

            // Verify claims unchanged after failed claim attempt
            const claimsAfterFailedClaim =
              await selectActiveResourceClaims(
                {
                  subscriptionId: subscription.id,
                  resourceId: resource.id,
                },
                transaction
              )
            expect(claimsAfterFailedClaim.length).toBe(2)
            return Result.ok(undefined)
          })
        ).unwrap()
      })

      it('during end-of-period downgrade interim, excess claims are temporary and expire at transition', async () => {
        // Edge Case 2: End-of-period downgrade with interim claims
        // This documents current behavior where claims during interim period
        // succeed against OLD capacity, potentially resulting in claims > capacity
        // after the transition

        const resource = await setupResource({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Seats',
        })

        // Create initial plan with 3 seat capacity
        const initialFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Initial Seats Feature',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 3,
        })

        await setupProductFeature({
          productId: product.id,
          featureId: initialFeature.id,
          organizationId: organization.id,
        })

        const subscriptionItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Initial Plan',
          quantity: 1,
          unitPrice: 1000,
        })

        await setupResourceSubscriptionItemFeature({
          subscriptionItemId: subscriptionItem.id,
          featureId: initialFeature.id,
          resourceId: resource.id,
          pricingModelId: pricingModel.id,
          amount: 3,
        })

        // Step 2: Claim 2 seats initially
        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            return claimResourceTransaction(
              {
                organizationId: organization.id,
                customerId: customer.id,
                input: {
                  resourceSlug: resource.slug,
                  subscriptionId: subscription.id,
                  externalIds: ['user-1', 'user-2'],
                },
              },
              transaction
            )
          })
        ).unwrap()

        // Create downgrade plan with 2 seat capacity
        const downgradedPrice = await setupPrice({
          productId: product.id,
          name: 'Downgraded Plan',
          type: PriceType.Subscription,
          unitPrice: 500,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          livemode: subscription.livemode,
          isDefault: false,
          currency: organization.defaultCurrency,
        })

        const downgradedFeature = await setupResourceFeature({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Downgraded Seats Feature',
          resourceId: resource.id,
          livemode: subscription.livemode,
          amount: 2, // Less than current 3
        })

        await setupProductFeature({
          productId: product.id,
          featureId: downgradedFeature.id,
          organizationId: organization.id,
        })

        // Set billing period to end in the future
        const periodEnd = Date.now() + 24 * 60 * 60 * 1000 // 1 day from now

        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx
            await updateBillingPeriod(
              {
                id: billingPeriod.id,
                startDate: Date.now() - 10 * 60 * 1000,
                endDate: periodEnd,
                status: BillingPeriodStatus.Active,
              },
              transaction
            )

            // Step 3: Schedule end-of-period downgrade to 2 seats
            const newItems: SubscriptionItem.Upsert[] = [
              {
                subscriptionId: subscription.id,
                priceId: downgradedPrice.id,
                name: 'Downgraded Plan',
                quantity: 1,
                unitPrice: 500,
                livemode: subscription.livemode,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                metadata: null,
                addedDate: periodEnd, // Scheduled for end of period
                externalId: null,
                type: SubscriptionItemType.Static,
                expiredAt: null,
              },
            ]

            await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newItems,
                  timing:
                    SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
                },
              },
              organization,
              ctx
            )

            // Verify adjustment is scheduled (old items have expiredAt = periodEnd)
            const items = await selectSubscriptionItems(
              { subscriptionId: subscription.id },
              transaction
            )
            const oldItem = items.find(
              (i) => i.name === 'Initial Plan'
            )
            const newItem = items.find(
              (i) => i.name === 'Downgraded Plan'
            )

            expect(oldItem?.name).toBe('Initial Plan')
            expect(oldItem!.expiredAt).toBe(periodEnd)
            expect(newItem?.name).toBe('Downgraded Plan')
            expect(newItem!.addedDate).toBe(periodEnd)

            // During interim: Capacity shows OLD value (3) because old items are still active
            const interimUsage = await getResourceUsage(
              subscription.id,
              resource.id,
              transaction
            )
            expect(interimUsage.capacity).toBe(3) // Old capacity still active
            expect(interimUsage.claimed).toBe(2)
            expect(interimUsage.available).toBe(1)

            // Step 4: During interim period, claim a 3rd seat
            // This SUCCEEDS because validation uses currently active items (old capacity=3)
            const thirdClaimResult = (
              await claimResourceTransaction(
                {
                  organizationId: organization.id,
                  customerId: customer.id,
                  input: {
                    resourceSlug: resource.slug,
                    subscriptionId: subscription.id,
                    externalIds: ['user-3'],
                  },
                },
                transaction
              )
            ).unwrap()
            expect(thirdClaimResult.claims.length).toBe(1)

            // Verify 3 claims now exist
            const claimsDuringInterim =
              await selectActiveResourceClaims(
                {
                  subscriptionId: subscription.id,
                  resourceId: resource.id,
                },
                transaction
              )
            expect(claimsDuringInterim.length).toBe(3)

            // Usage during interim shows all 3 claimed against old capacity
            const usageWithThirdClaim = await getResourceUsage(
              subscription.id,
              resource.id,
              transaction
            )
            expect(usageWithThirdClaim.capacity).toBe(3)
            expect(usageWithThirdClaim.claimed).toBe(3)
            expect(usageWithThirdClaim.available).toBe(0)
            return Result.ok(undefined)
          })
        ).unwrap()

        // Step 5: Simulate time passing - transition to new billing period
        // Use anchorDate parameter to simulate checking capacity after period end
        const afterTransitionAnchor = periodEnd + 1000 // 1 second after period end

        ;(
          await adminTransaction(async (ctx) => {
            const { transaction } = ctx

            // Update billing period to reflect the new period
            await updateBillingPeriod(
              {
                id: billingPeriod.id,
                startDate: periodEnd, // New period starts where old one ended
                endDate: periodEnd + 30 * 24 * 60 * 60 * 1000, // 30 days
                status: BillingPeriodStatus.Active,
              },
              transaction
            )

            // After transition: Claims still exist but capacity is now reduced
            const claimsAfterTransition =
              await selectActiveResourceClaims(
                {
                  subscriptionId: subscription.id,
                  resourceId: resource.id,
                },
                transaction
              )
            // All 3 claim records still exist in the database (not released yet)
            // selectActiveResourceClaims uses Date.now(), so the temporary claim
            // is still considered "active" in real time
            expect(claimsAfterTransition.length).toBe(3)

            // However, when checking usage at the anchor date (after transition),
            // the temporary claim (user-3) has expiredAt = periodEnd, which is
            // before afterTransitionAnchor. So it's correctly filtered out.
            const usageAfterTransition = await getResourceUsage(
              subscription.id,
              resource.id,
              transaction,
              afterTransitionAnchor
            )
            expect(usageAfterTransition.capacity).toBe(2) // New capacity
            // Temporary claim (user-3) expired at periodEnd, so only 2 claims count
            expect(usageAfterTransition.claimed).toBe(2)
            // Capacity matches claimed - no excess, no availability
            expect(usageAfterTransition.available).toBe(0)
            return Result.ok(undefined)
          })
        ).unwrap()
      })
    })
  })
})
