import { describe, it, expect, beforeEach } from 'vitest'
import {
  adjustSubscription,
  calculateSplitInBillingPeriodBasedOnAdjustmentDate,
  syncSubscriptionWithActiveItems,
} from '@/subscriptions/adjustSubscription'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  SubscriptionAdjustmentTiming,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'
import { adminTransaction } from '@/db/adminTransaction'

// These seed methods (and the clearDatabase helper) come from our test support code.
// They create real records in our test database.
import {
  setupSubscription,
  setupSubscriptionItem,
  setupBillingPeriod,
  setupOrg,
  setupCustomer,
  setupBillingRun,
  setupBillingPeriodItem,
  setupPaymentMethod,
} from '@/../seedDatabase'

// Helpers to query the database after adjustments
import { selectSubscriptionItemsAndSubscriptionBySubscriptionId } from '@/db/tableMethods/subscriptionItemMethods'
import {
  selectCurrentBillingPeriodForSubscription,
  updateBillingPeriod,
} from '@/db/tableMethods/billingPeriodMethods'
import { selectBillingPeriodItems } from '@/db/tableMethods/billingPeriodItemMethods'
import { selectBillingRuns } from '@/db/tableMethods/billingRunMethods'
import { updateSubscription } from '@/db/tableMethods/subscriptionMethods'
import {
  updateSubscriptionItem,
  expireSubscriptionItem,
} from '@/db/tableMethods/subscriptionItemMethods'
import { addDays, subDays } from 'date-fns'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { Customer } from '@/db/schema/customers'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { BillingRun } from '@/db/schema/billingRuns'
import { Subscription } from '@/db/schema/subscriptions'

describe('adjustSubscription Integration Tests', async () => {
  const { organization, price } = await setupOrg()
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
    | 'usageMeterId'
    | 'usageEventsPerUnit'
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
      currentBillingPeriodEnd: new Date(Date.now() - 3000),
      currentBillingPeriodStart: new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ),
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
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: null,
      addedDate: new Date(),
      externalId: null,
      type: SubscriptionItemType.Static,
      usageMeterId: null,
      usageEventsPerUnit: null,
    }
  })

  /* ==========================================================================
     Error Conditions
  ========================================================================== */
  describe('Error Conditions', () => {
    it('should throw "Subscription is in terminal state" if the subscription is terminal', async () => {
      // Create a subscription already in a terminal state.
      const canceledSubscription = await setupSubscription({
        status: SubscriptionStatus.Canceled,
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
      })
      await adminTransaction(async ({ transaction }) => {
        // Create a billing period so that later steps have data.
        await updateBillingPeriod(
          {
            id: billingPeriod.id,
            startDate: new Date(Date.now() - 10 * 60 * 1000),
            endDate: new Date(Date.now() + 10 * 60 * 1000),
            status: BillingPeriodStatus.Active,
          },
          transaction
        )

        await expect(
          adjustSubscription(
            {
              id: canceledSubscription.id,
              adjustment: {
                newSubscriptionItems: [],
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            transaction
          )
        ).rejects.toThrow('Subscription is in terminal state')
      })
    })

    it('should throw "Invalid timing" if an unrecognized timing value is provided', async () => {
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })
      await adminTransaction(async ({ transaction }) => {
        await updateBillingPeriod(
          {
            id: billingPeriod.id,
            startDate: new Date(Date.now() - 10 * 60 * 1000),
            endDate: new Date(Date.now() + 10 * 60 * 1000),
            status: BillingPeriodStatus.Active,
          },
          transaction
        )
        await expect(
          adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: [],
                // @ts-expect-error – intentionally passing an invalid timing value
                timing: 'invalid',
                prorateCurrentBillingPeriod: false,
              },
            },
            transaction
          )
        ).rejects.toThrow('Invalid timing')
      })
    })
  })

  /* ==========================================================================
     Immediate Adjustments
  ========================================================================== */
  describe('Immediate Adjustments', () => {
    describe('when prorateCurrentBillingPeriod is true', () => {
      it('should create proration adjustments, remove deleted items, and execute a billing run', async () => {
        // Create two existing subscription items.
        const item1 = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Item 1',
          quantity: 1,
          unitPrice: 100,
        })
        const item2 = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Item 2',
          quantity: 2,
          unitPrice: 200,
        })
        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: BillingPeriodStatus.Active,
        })
        await adminTransaction(async ({ transaction }) => {
          // New subscription items: keep item1 and add a new item.
          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...item1,
              id: item1.id,
              name: 'Item 1',
              quantity: 1,
              unitPrice: 100,
            },
            {
              ...subscriptionItemCore,
              name: 'Item 3',
              quantity: 3,
              unitPrice: 300,
              livemode: subscription.livemode,
              externalId: null,
              expiredAt: null,
              type: SubscriptionItemType.Static,
              usageMeterId: null,
              usageEventsPerUnit: null,
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
            transaction
          )

          // Verify that subscription items were updated with addedDate/removedDate.
          const result =
            await selectSubscriptionItemsAndSubscriptionBySubscriptionId(
              subscription.id,
              transaction
            )
          expect(result).not.toBeNull()
          if (!result) {
            throw new Error('Result is null')
          }
          // Expect that the item not present in newItems (item2) was “removed” and new items were added.
          expect(result?.subscriptionItems.length).toBe(3)
          result?.subscriptionItems.forEach((item) => {
            expect(item.addedDate).toBeInstanceOf(Date)
          })

          // Verify proration adjustments were inserted.
          const bpItems = await selectBillingPeriodItems(
            { billingPeriodId: billingPeriod.id },
            transaction
          )

          expect(bpItems.length).toBeGreaterThan(0)
          bpItems.forEach((adj) => {
            // Unit prices should be rounded to whole numbers.
            expect(adj.unitPrice % 1).toEqual(0)
          })
          // Verify that a billing run was executed.
          const billingRuns = await selectBillingRuns(
            { billingPeriodId: billingPeriod.id },
            transaction
          )
          const approximatelyImmediateBillingRuns =
            billingRuns.filter((run) => {
              return (
                Math.abs(
                  run.scheduledFor.getTime() - new Date().getTime()
                ) < 10000
              )
            })
          expect(approximatelyImmediateBillingRuns.length).toBe(1)
        })
      })
    })

    describe('when prorateCurrentBillingPeriod is false', () => {
      it('should update subscription items without creating proration adjustments', async () => {
        const item1 = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Item 1',
          quantity: 1,
          unitPrice: 100,
        })
        await adminTransaction(async ({ transaction }) => {
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
              endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
              status: BillingPeriodStatus.Active,
            },
            transaction
          )
          const billingPeriodItemsBeforeAdjustment =
            await selectBillingPeriodItems(
              { billingPeriodId: billingPeriod.id },
              transaction
            )

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...item1,
              name: 'Item 1',
              quantity: 1,
              unitPrice: 100,
              expiredAt: null,
              type: SubscriptionItemType.Static,
              usageMeterId: null,
              usageEventsPerUnit: null,
            },
            {
              ...subscriptionItemCore,
              name: 'Item 3',
              quantity: 3,
              unitPrice: 300,
              expiredAt: null,
              type: SubscriptionItemType.Static,
              usageMeterId: null,
              usageEventsPerUnit: null,
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
            transaction
          )

          const result =
            await selectSubscriptionItemsAndSubscriptionBySubscriptionId(
              subscription.id,
              transaction
            )
          expect(result).not.toBeNull()
          if (!result) {
            throw new Error('Result is null')
          }
          expect(result.subscriptionItems.length).toBe(2)

          // Verify that no proration adjustments were made.
          const bp = await selectCurrentBillingPeriodForSubscription(
            subscription.id,
            transaction
          )
          expect(bp).not.toBeNull()
          if (!bp) {
            throw new Error('Billing period is null')
          }
          const billingPeriodItemsAfterAdjustment =
            await selectBillingPeriodItems(
              { billingPeriodId: bp.id },
              transaction
            )
          expect(billingPeriodItemsAfterAdjustment.length).toEqual(
            billingPeriodItemsBeforeAdjustment.length
          )
          // Verify that the billing period items have the same values as before
          expect(
            billingPeriodItemsAfterAdjustment
              .map((item) => ({
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                name: item.name,
                description: item.description,
              }))
              .sort((a, b) => a.name.localeCompare(b.name))
          ).toEqual(
            billingPeriodItemsBeforeAdjustment
              .map((item) => ({
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                name: item.name,
                description: item.description,
              }))
              .sort((a, b) => a.name.localeCompare(b.name))
          )
        })
      })
    })
  })

  /* ==========================================================================
     Adjustments at End of Current Billing Period
  ========================================================================== */
  describe('Adjustments at End of Current Billing Period', () => {
    it('should update subscription items with dates equal to the billing period end and not create proration adjustments', async () => {
      // Set a specific billing period end date.
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })
      const item2 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 2',
        quantity: 2,
        unitPrice: 200,
      })
      billingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: BillingPeriodStatus.Active,
      })
      await adminTransaction(async ({ transaction }) => {
        const newItems: SubscriptionItem.Upsert[] = [
          {
            ...item1,
            id: item1.id,
            name: 'Item 1',
            quantity: 1,
            unitPrice: 100,
            externalId: null,
            priceId: price.id,
            expiredAt: null,
          },
          {
            name: 'Item 3',
            subscriptionId: subscription.id,
            quantity: 3,
            unitPrice: 300,
            livemode: subscription.livemode,
            metadata: null,
            addedDate: new Date(),
            priceId: price.id,
            externalId: null,
            expiredAt: null,
            type: SubscriptionItemType.Static,
            usageMeterId: null,
            usageEventsPerUnit: null,
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
          transaction
        )

        const result =
          await selectSubscriptionItemsAndSubscriptionBySubscriptionId(
            subscription.id,
            transaction
          )
        expect(result).not.toBeNull()
        if (!result) {
          throw new Error('Result is null')
        }
        const bpItems = await selectBillingPeriodItems(
          { billingPeriodId: billingPeriod.id },
          transaction
        )
        expect(bpItems.length).toEqual(0)
      })
    })
  })

  /* ==========================================================================
     Calculation Helper Function
  ========================================================================== */
  describe('calculateSplitInBillingPeriodBasedOnAdjustmentDate', () => {
    it('should return correct percentages when adjustment date is at start, middle, and end', () => {
      let adjustmentDate = new Date(billingPeriod.startDate)
      let split = calculateSplitInBillingPeriodBasedOnAdjustmentDate(
        adjustmentDate,
        billingPeriod
      )
      expect(split.beforePercentage).toBe(0)
      expect(split.afterPercentage).toBe(1)

      adjustmentDate = new Date(billingPeriod.endDate)
      split = calculateSplitInBillingPeriodBasedOnAdjustmentDate(
        adjustmentDate,
        billingPeriod
      )
      expect(split.beforePercentage).toBe(1)
      expect(split.afterPercentage).toBe(0)

      adjustmentDate = new Date(
        billingPeriod.startDate.getTime() +
          (billingPeriod.endDate.getTime() -
            billingPeriod.startDate.getTime()) /
            2
      )
      split = calculateSplitInBillingPeriodBasedOnAdjustmentDate(
        adjustmentDate,
        billingPeriod
      )
      expect(split.beforePercentage).toBeCloseTo(0.5, 1)
      expect(split.afterPercentage).toBeCloseTo(0.5, 1)
    })

    it('should throw an error if the adjustment date is outside the billing period', () => {
      const tooEarlyAdjustmentDate = new Date(
        billingPeriod.startDate.getTime() - 1000
      )
      expect(() => {
        calculateSplitInBillingPeriodBasedOnAdjustmentDate(
          tooEarlyAdjustmentDate,
          billingPeriod
        )
      }).toThrow()
      const tooLateAdjustmentDate = new Date(
        billingPeriod.endDate.getTime() + 1000
      )
      expect(() => {
        calculateSplitInBillingPeriodBasedOnAdjustmentDate(
          tooLateAdjustmentDate,
          billingPeriod
        )
      }).toThrow()
    })
  })

  /* ==========================================================================
     Edge Cases and Error Handling
  ========================================================================== */
  describe('Edge Cases and Error Handling', () => {
    it('should handle a zero-duration billing period', async () => {
      const zeroDurationBillingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date('2025-01-01T00:00:00Z'),
        endDate: new Date('2025-01-01T00:00:00Z'),
        status: BillingPeriodStatus.Active,
      })
      const item = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item Zero',
        quantity: 1,
        unitPrice: 100,
      })
      await adminTransaction(async ({ transaction }) => {
        const newItems: SubscriptionItem.Upsert[] = [
          {
            id: item.id,
            name: 'Item Zero',
            quantity: 1,
            unitPrice: 100,
            livemode: subscription.livemode,
            createdAt: new Date(),
            updatedAt: new Date(),
            metadata: null,
            addedDate: new Date(),
            subscriptionId: subscription.id,
            priceId: price.id,
            externalId: null,
            expiredAt: null,
            type: SubscriptionItemType.Static,
            usageMeterId: null,
            usageEventsPerUnit: null,
          },
        ]

        await expect(
          adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            transaction
          )
        ).rejects.toThrow()
      })
    })

    it('should handle the case where there are no existing subscription items', async () => {
      await adminTransaction(async ({ transaction }) => {
        await updateBillingPeriod(
          {
            id: billingPeriod.id,
            startDate: new Date(Date.now() - 3600000),
            endDate: new Date(Date.now() + 3600000),
            status: BillingPeriodStatus.Active,
          },
          transaction
        )

        // No subscription items are set up.
        const newItems: SubscriptionItem.Upsert[] = [
          {
            ...subscriptionItemCore,
            name: 'New Item 1',
            quantity: 2,
            unitPrice: 150,
            expiredAt: null,
            type: SubscriptionItemType.Static,
            usageMeterId: null,
            usageEventsPerUnit: null,
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
          transaction
        )

        const result =
          await selectSubscriptionItemsAndSubscriptionBySubscriptionId(
            subscription.id,
            transaction
          )
        expect(result).not.toBeNull()
        if (!result) {
          throw new Error('Result is null')
        }
        expect(result.subscriptionItems.length).toBe(newItems.length)
      })
    })

    it('should throw an error when subscription items have zero quantity', async () => {
      await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date(Date.now() - 3600000),
        endDate: new Date(Date.now() + 3600000),
        status: BillingPeriodStatus.Active,
      })

      await adminTransaction(async ({ transaction }) => {
        const newItems: SubscriptionItem.Upsert[] = [
          {
            ...subscriptionItemCore,
            name: 'Zero Quantity Item',
            quantity: 0, // Invalid quantity
            unitPrice: 100,
            livemode: false,
            expiredAt: null,
            type: SubscriptionItemType.Static,
            usageMeterId: null,
            usageEventsPerUnit: null,
          },
        ]

        await expect(
          adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            transaction
          )
        ).rejects.toThrow()
      })
    })

    it('should handle subscription items with zero unit price', async () => {
      await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date(Date.now() - 3600000),
        endDate: new Date(Date.now() + 3600000),
        status: BillingPeriodStatus.Active,
      })
      await adminTransaction(async ({ transaction }) => {
        const newItems: SubscriptionItem.Upsert[] = [
          {
            ...subscriptionItemCore,
            name: 'Free Item',
            quantity: 1,
            unitPrice: 0,
            livemode: false,
            expiredAt: null,
            type: SubscriptionItemType.Static,
            usageMeterId: null,
            usageEventsPerUnit: null,
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
          transaction
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
        expect(bpItems.length).toBeGreaterThan(0)
      })
    })

    it('should handle subscription items with negative unit price or quantity', async () => {
      const negativeItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Negative Item',
        quantity: 1,
        unitPrice: 100,
      })
      await expect(
        adminTransaction(async ({ transaction }) => {
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: new Date(Date.now() - 3600000),
              endDate: new Date(Date.now() + 3600000),
            },
            transaction
          )

          const newItems = [
            {
              ...negativeItem,
              name: 'Negative Item',
              quantity: -1,
              unitPrice: -100,
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
            transaction
          )
        })
      ).rejects.toThrow()
    })

    it('should handle billing periods in the past appropriately', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create a past billing period.
        const pastBP = await updateBillingPeriod(
          {
            id: billingPeriod.id,
            subscriptionId: subscription.id,
            startDate: new Date(Date.now() - 7200000),
            endDate: new Date(Date.now() - 3600000),
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
        await expect(
          adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newPastItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            transaction
          )
        ).rejects.toThrow()
      })
    })
  })

  /* ==========================================================================
     Bulk Operations
  ========================================================================== */
  describe('Bulk Operations', () => {
    it('should correctly bulk update subscription items and insert proration adjustments', async () => {
      await adminTransaction(async ({ transaction }) => {
        const item1 = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Item 1',
          quantity: 1,
          unitPrice: 100,
        })
        billingPeriod = await updateBillingPeriod(
          {
            id: billingPeriod.id,
            startDate: new Date(Date.now() - 3600000),
            endDate: new Date(Date.now() + 3600000),
            status: BillingPeriodStatus.Active,
          },
          transaction
        )
        const newItems: SubscriptionItem.Upsert[] = [
          {
            ...item1,
            name: 'Item 1',
            quantity: 1,
            unitPrice: 100,
            expiredAt: null,
          },
          {
            ...subscriptionItemCore,
            name: 'Item 2',
            quantity: 2,
            unitPrice: 200,
            expiredAt: null,
            type: SubscriptionItemType.Static,
            usageMeterId: null,
            usageEventsPerUnit: null,
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
          transaction
        )
        const result =
          await selectSubscriptionItemsAndSubscriptionBySubscriptionId(
            subscription.id,
            transaction
          )
        if (!result) {
          throw new Error('Result is null')
        }
        expect(result.subscriptionItems.length).toBe(2)
        const bpItems = await selectBillingPeriodItems(
          { billingPeriodId: billingPeriod.id },
          transaction
        )
        expect(bpItems.length).toBeGreaterThan(0)
      })
    })

    it('should handle errors during bulk operations gracefully and rollback', async () => {
      const item = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item',
        quantity: 1,
        unitPrice: 100,
      })
      await adminTransaction(async ({ transaction }) => {
        await updateBillingPeriod(
          {
            id: billingPeriod.id,
            startDate: new Date(Date.now() - 3600000),
            endDate: new Date(Date.now() + 3600000),
            status: BillingPeriodStatus.Active,
          },
          transaction
        )
        await expect(
          adminTransaction(async ({ transaction }) => {
            // Pass invalid data (e.g. unitPrice is null) to simulate an error.
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
                usageMeterId: null,
                usageEventsPerUnit: null,
              },
            ]
            await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: invalidItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: false,
                },
              },
              transaction
            )
          })
        ).rejects.toThrow()
      })
    })
  })

  /* ==========================================================================
     Subscription Record Update
  ========================================================================== */
  describe('Subscription Record Update', () => {
    it('should update subscription record when subscription items change to maintain data consistency', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create initial subscription item
        const initialItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Cheap Plan - Monthly',
          quantity: 1,
          unitPrice: 999, // $9.99
        })

        // Create billing period
        await updateBillingPeriod(
          {
            id: billingPeriod.id,
            startDate: new Date(Date.now() - 3600000),
            endDate: new Date(Date.now() + 3600000),
            status: BillingPeriodStatus.Active,
          },
          transaction
        )

        // Adjust to a different subscription item (simulating plan change)
        const newItems: SubscriptionItem.Upsert[] = [
          {
            ...subscriptionItemCore,
            name: 'Expensive Plan - Monthly',
            quantity: 1,
            unitPrice: 9999, // $99.99
            expiredAt: null,
            type: SubscriptionItemType.Static,
            usageMeterId: null,
            usageEventsPerUnit: null,
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
          transaction
        )

        // Verify that the returned subscription has updated information
        expect(result.subscription.name).toBe(
          'Expensive Plan - Monthly'
        )
        expect(result.subscription.priceId).toBe(price.id)

        // Verify that the subscription record in the database was actually updated
        const dbResult =
          await selectSubscriptionItemsAndSubscriptionBySubscriptionId(
            subscription.id,
            transaction
          )
        expect(dbResult).not.toBeNull()
        if (!dbResult) {
          throw new Error('Result is null')
        }

        // The subscription record should have been updated to match the primary subscription item
        expect(dbResult.subscription.name).toBe(
          'Expensive Plan - Monthly'
        )
        expect(dbResult.subscription.priceId).toBe(price.id)

        // With the new sync logic, we expect both items (expired old item + new active item)
        expect(dbResult.subscriptionItems.length).toBe(2)

        // Find the active item (should have no expiredAt)
        const activeItem = dbResult.subscriptionItems.find(
          (item) => !item.expiredAt
        )
        expect(activeItem).toBeDefined()
        expect(activeItem?.name).toBe('Expensive Plan - Monthly')
        expect(activeItem?.unitPrice).toBe(9999)

        // Find the expired item (should have expiredAt set)
        const expiredItem = dbResult.subscriptionItems.find(
          (item) => item.expiredAt
        )
        expect(expiredItem).toBeDefined()
        expect(expiredItem?.name).toBe('Cheap Plan - Monthly')
        expect(expiredItem?.unitPrice).toBe(999)
      })
    })

    it('should use the most expensive subscription item when multiple items exist', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create billing period
        await updateBillingPeriod(
          {
            id: billingPeriod.id,
            startDate: new Date(Date.now() - 3600000),
            endDate: new Date(Date.now() + 3600000),
            status: BillingPeriodStatus.Active,
          },
          transaction
        )

        // Adjust to multiple subscription items
        const newItems: SubscriptionItem.Upsert[] = [
          {
            ...subscriptionItemCore,
            name: 'Primary Plan - Monthly',
            quantity: 1,
            unitPrice: 5000,
            expiredAt: null,
            type: SubscriptionItemType.Static,
            usageMeterId: null,
            usageEventsPerUnit: null,
          },
          {
            ...subscriptionItemCore,
            name: 'Add-on Feature',
            quantity: 1,
            unitPrice: 1000,
            expiredAt: null,
            type: SubscriptionItemType.Static,
            usageMeterId: null,
            usageEventsPerUnit: null,
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
          transaction
        )

        // Verify that the subscription record uses the most expensive item's information
        // Primary Plan (5000) is more expensive than Add-on Feature (1000)
        expect(result.subscription.name).toBe(
          'Primary Plan - Monthly'
        )
        expect(result.subscription.priceId).toBe(price.id)

        // Verify in database as well
        const dbResult =
          await selectSubscriptionItemsAndSubscriptionBySubscriptionId(
            subscription.id,
            transaction
          )
        expect(dbResult).not.toBeNull()
        if (!dbResult) {
          throw new Error('Result is null')
        }

        expect(dbResult.subscription.name).toBe(
          'Primary Plan - Monthly'
        )
        expect(dbResult.subscriptionItems.length).toBe(2) // Both new items should be present
      })
    })

    it('should NOT sync subscription record with future-dated items (At End of Current Billing Period)', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create initial subscription item
        const initialItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Current Plan',
          quantity: 1,
          unitPrice: 1000, // $10.00
        })

        // Create active billing period (current period)
        const futureDate = new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ) // 7 days from now
        await updateBillingPeriod(
          {
            id: billingPeriod.id,
            startDate: new Date(Date.now() - 3600000), // 1 hour ago
            endDate: futureDate, // 7 days from now
            status: BillingPeriodStatus.Active,
          },
          transaction
        )

        // Also update the subscription's currentBillingPeriodEnd to match
        // And sync the name/priceId with the current active item
        await updateSubscription(
          {
            id: subscription.id,
            currentBillingPeriodEnd: futureDate,
            name: 'Current Plan', // Set the subscription name to match the initial item
            priceId: price.id, // Set the priceId
            renews: true, // Required field
          },
          transaction
        )

        // Update local reference too
        subscription.currentBillingPeriodEnd = futureDate
        subscription.name = 'Current Plan' // Update local reference
        subscription.priceId = price.id

        // Adjust subscription to a more expensive plan at END of current billing period
        const newItems: SubscriptionItem.Upsert[] = [
          {
            ...subscriptionItemCore,
            name: 'Future Plan',
            quantity: 1,
            unitPrice: 5000, // $50.00 (more expensive)
            expiredAt: null,
            type: SubscriptionItemType.Static,
            usageMeterId: null,
            usageEventsPerUnit: null,
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
          transaction
        )

        // CRITICAL: Subscription should still show the CURRENT plan, NOT the future plan
        // because the new item has addedDate = futureDate (end of billing period)
        expect(result.subscription.name).toBe('Current Plan')
        expect(result.subscription.priceId).toBe(price.id) // Should match current plan's priceId

        // Verify in database as well
        const dbResult =
          await selectSubscriptionItemsAndSubscriptionBySubscriptionId(
            subscription.id,
            transaction
          )
        expect(dbResult).not.toBeNull()
        if (!dbResult) {
          throw new Error('Result is null')
        }

        // Subscription record should reflect CURRENT active plan, not future plan
        expect(dbResult.subscription.name).toBe('Current Plan')

        // Should have both items: current (active) and future (not yet active)
        expect(dbResult.subscriptionItems.length).toBe(2)

        // Verify we have one expired current item and one future item
        const expiredCurrentItem = dbResult.subscriptionItems.find(
          (item) => item.name === 'Current Plan' && item.expiredAt
        )
        const futureItem = dbResult.subscriptionItems.find(
          (item) => item.name === 'Future Plan' && !item.expiredAt
        )

        expect(expiredCurrentItem).toBeDefined()
        expect(expiredCurrentItem?.expiredAt).toBeDefined() // Should be expired at billing period end
        expect(futureItem).toBeDefined()
        expect(futureItem?.addedDate.getTime()).toBe(
          futureDate.getTime()
        )
      })
    })

    it('should handle subscription record update with proration enabled', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Create initial subscription item
        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Original Plan',
          quantity: 1,
          unitPrice: 2000,
        })

        // Create active billing period
        await updateBillingPeriod(
          {
            id: billingPeriod.id,
            startDate: new Date(Date.now() - 3600000),
            endDate: new Date(Date.now() + 3600000),
            status: BillingPeriodStatus.Active,
          },
          transaction
        )

        const newItems: SubscriptionItem.Upsert[] = [
          {
            ...subscriptionItemCore,
            name: 'Updated Plan - Pro',
            quantity: 1,
            unitPrice: 4000,
            expiredAt: null,
            type: SubscriptionItemType.Static,
            usageMeterId: null,
            usageEventsPerUnit: null,
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
          transaction
        )

        // Even with proration, subscription record should be updated
        expect(result.subscription.name).toBe('Updated Plan - Pro')
        expect(result.subscription.priceId).toBe(price.id)
      })
    })
  })

  /* ==========================================================================
     syncSubscriptionWithActiveItems Tests
  ========================================================================== */
  describe('syncSubscriptionWithActiveItems', () => {
    it('should sync subscription with currently active items', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = new Date()
        const futureDate = addDays(now, 1) // Tomorrow

        // Setup: Create current active item
        const currentItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Current Plan',
          quantity: 1,
          unitPrice: 999, // $9.99
          addedDate: subDays(now, 10), // Started 10 days ago
          type: SubscriptionItemType.Static,
        })

        // Expire the current item in the future
        await expireSubscriptionItem(
          currentItem.id,
          futureDate,
          transaction
        )

        // Setup: Create future item that will become active tomorrow
        const futureItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'New Premium Plan',
          quantity: 1,
          unitPrice: 4999, // $49.99
          addedDate: futureDate, // Starts tomorrow
          type: SubscriptionItemType.Static,
        })

        // Test: Sync should use current item (future item not active yet)
        const synced = await syncSubscriptionWithActiveItems(
          subscription.id,
          transaction,
          new Date()
        )
        expect(synced.name).toBe('Current Plan')
        expect(synced.priceId).toBe(currentItem.priceId)
      })
    })

    it('should handle multiple items becoming active and choose the most expensive as primary', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = new Date()
        const pastDate = subDays(now, 1) // Yesterday

        // Setup: Create multiple items that are all currently active
        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Basic Feature',
          quantity: 1,
          unitPrice: 500, // $5.00
          addedDate: pastDate,
          type: SubscriptionItemType.Static,
        })

        const premiumItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Premium Feature',
          quantity: 1,
          unitPrice: 3000, // $30.00 - Most expensive
          addedDate: pastDate,
          type: SubscriptionItemType.Static,
        })

        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Standard Feature',
          quantity: 1,
          unitPrice: 1500, // $15.00
          addedDate: pastDate,
          type: SubscriptionItemType.Static,
        })

        // All items are active now - should choose the most expensive (Premium Feature)
        const synced = await syncSubscriptionWithActiveItems(
          subscription.id,
          transaction,
          new Date()
        )

        expect(synced.name).toBe('Premium Feature')
        expect(synced.priceId).toBe(premiumItem.priceId)
      })
    })

    it('should handle subscription becoming active but not primary (lower price than existing)', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = new Date()
        const futureDate = addDays(now, 1)

        // Setup: Create expensive current item
        const expensiveItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Enterprise Plan',
          quantity: 1,
          unitPrice: 9999, // $99.99 - Most expensive
          addedDate: subDays(now, 10),
          type: SubscriptionItemType.Static,
        })

        // Setup: Create cheaper item that is also active
        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Add-on Feature',
          quantity: 1,
          unitPrice: 999, // $9.99 - Cheaper
          addedDate: subDays(now, 1), // Already active since yesterday
          type: SubscriptionItemType.Static,
        })

        // Both are active now - should still use Enterprise Plan as primary
        const synced = await syncSubscriptionWithActiveItems(
          subscription.id,
          transaction,
          new Date()
        )

        expect(synced.name).toBe('Enterprise Plan')
        expect(synced.priceId).toBe(expensiveItem.priceId)
      })
    })

    it('should update primary when current primary item gets cancelled', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = new Date()

        // Setup: Create multiple active items
        const primaryItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Premium Plan',
          quantity: 1,
          unitPrice: 4999, // $49.99 - Initially most expensive
          addedDate: subDays(now, 10),
          type: SubscriptionItemType.Static,
        })

        const secondaryItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Standard Plan',
          quantity: 1,
          unitPrice: 2999, // $29.99 - Second most expensive
          addedDate: subDays(now, 5),
          type: SubscriptionItemType.Static,
        })

        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Basic Plan',
          quantity: 1,
          unitPrice: 999, // $9.99 - Cheapest
          addedDate: subDays(now, 3),
          type: SubscriptionItemType.Static,
        })

        // Initial sync - should use Premium Plan
        const syncedBefore = await syncSubscriptionWithActiveItems(
          subscription.id,
          transaction,
          new Date()
        )
        expect(syncedBefore.name).toBe('Premium Plan')

        // Cancel the primary item - set as already expired
        await updateSubscriptionItem(
          {
            id: primaryItem.id,
            expiredAt: subDays(now, 1), // Already expired yesterday
            type: SubscriptionItemType.Static,
          },
          transaction
        )

        // Sync after cancellation - should switch to Standard Plan
        const syncedAfter = await syncSubscriptionWithActiveItems(
          subscription.id,
          transaction,
          new Date()
        )
        expect(syncedAfter.name).toBe('Standard Plan')
        expect(syncedAfter.priceId).toBe(secondaryItem.priceId)
      })
    })

    it('should handle multiple items becoming active and inactive simultaneously', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = new Date()

        // Setup: Currently active items (old items)
        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Old Basic',
          quantity: 1,
          unitPrice: 999,
          addedDate: subDays(now, 10),
          type: SubscriptionItemType.Static,
        })

        const oldPremiumItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Old Premium',
          quantity: 1,
          unitPrice: 4999,
          addedDate: subDays(now, 10),
          type: SubscriptionItemType.Static,
        })

        // Setup: New items that are also active now (simulating post-rollover state)
        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'New Basic',
          quantity: 1,
          unitPrice: 1999, // $19.99
          addedDate: subDays(now, 1), // Started yesterday
          type: SubscriptionItemType.Static,
        })

        const newPremiumItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'New Premium',
          quantity: 1,
          unitPrice: 6999, // $69.99 - Most expensive overall
          addedDate: subDays(now, 1), // Started yesterday
          type: SubscriptionItemType.Static,
        })

        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'New Add-on',
          quantity: 1,
          unitPrice: 500, // $5.00
          addedDate: subDays(now, 1), // Started yesterday
          type: SubscriptionItemType.Static,
        })

        // With all items active - should use New Premium (most expensive)
        const synced = await syncSubscriptionWithActiveItems(
          subscription.id,
          transaction,
          new Date()
        )
        expect(synced.name).toBe('New Premium')
        expect(synced.priceId).toBe(newPremiumItem.priceId)
      })
    })

    it('should maintain subscription state when all items expire with no replacements', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = new Date()

        // Setup: Create an active item first
        const activeItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Active Plan',
          quantity: 1,
          unitPrice: 2999,
          addedDate: subDays(now, 10),
          type: SubscriptionItemType.Static,
        })

        // First, sync while the item is active to set the subscription name
        const syncedActive = await syncSubscriptionWithActiveItems(
          subscription.id,
          transaction,
          new Date()
        )
        expect(syncedActive.name).toBe('Active Plan')

        // Now expire the item
        await updateSubscriptionItem(
          {
            id: activeItem.id,
            expiredAt: subDays(now, 1), // Already expired
            type: SubscriptionItemType.Static,
          },
          transaction
        )

        // Sync after expiration with no active items
        const syncedAfterExpiry =
          await syncSubscriptionWithActiveItems(
            subscription.id,
            transaction,
            new Date()
          )

        // Should maintain the last known state (Active Plan)
        expect(syncedAfterExpiry.name).toBe('Active Plan')
        expect(syncedAfterExpiry.priceId).toBe(price.id)
        expect(syncedAfterExpiry.id).toBe(subscription.id)
      })
    })

    it('should handle quantity changes affecting total price calculations', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = new Date()

        // Setup: Item with high unit price but low quantity
        const highUnitPriceItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'High Unit Price',
          quantity: 1,
          unitPrice: 5000, // $50 per unit, total = $50
          addedDate: subDays(now, 5),
          type: SubscriptionItemType.Static,
        })

        // Setup: Item with low unit price but high quantity
        const highQuantityItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'High Quantity',
          quantity: 10,
          unitPrice: 1000, // $10 per unit, total = $100 (MORE expensive)
          addedDate: subDays(now, 5),
          type: SubscriptionItemType.Static,
        })

        // Sync - should choose high quantity item (higher total)
        const synced = await syncSubscriptionWithActiveItems(
          subscription.id,
          transaction,
          new Date()
        )

        expect(synced.name).toBe('High Quantity')
        expect(synced.priceId).toBe(highQuantityItem.priceId)
      })
    })

    it('should use addedDate as tiebreaker when items have same total price', async () => {
      await adminTransaction(async ({ transaction }) => {
        const now = new Date()

        // Setup: Two items with same total price
        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Older Item',
          quantity: 1,
          unitPrice: 3000, // $30.00
          addedDate: subDays(now, 10), // Older
          type: SubscriptionItemType.Static,
        })

        const newerItem = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          priceId: price.id,
          name: 'Newer Item',
          quantity: 1,
          unitPrice: 3000, // Same price: $30.00
          addedDate: subDays(now, 5), // Newer - should win
          type: SubscriptionItemType.Static,
        })

        // Sync - should choose newer item as tiebreaker
        const synced = await syncSubscriptionWithActiveItems(
          subscription.id,
          transaction,
          new Date()
        )

        expect(synced.name).toBe('Newer Item')
        expect(synced.priceId).toBe(newerItem.priceId)
      })
    })
  })
})
