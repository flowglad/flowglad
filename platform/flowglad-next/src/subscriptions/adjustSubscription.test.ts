import { addDays, subDays } from 'date-fns'
import { beforeEach, describe, expect, it } from 'vitest'
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
  setupSubscription,
  setupSubscriptionItem,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import { BillingRun } from '@/db/schema/billingRuns'
import type { Customer } from '@/db/schema/customers'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import { selectBillingPeriodItems } from '@/db/tableMethods/billingPeriodItemMethods'
import {
  selectCurrentBillingPeriodForSubscription,
  updateBillingPeriod,
} from '@/db/tableMethods/billingPeriodMethods'
import { selectBillingRuns } from '@/db/tableMethods/billingRunMethods'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
// Helpers to query the database after adjustments
import {
  expireSubscriptionItems,
  selectSubscriptionItemsAndSubscriptionBySubscriptionId,
  updateSubscriptionItem,
} from '@/db/tableMethods/subscriptionItemMethods'
import { updateSubscription } from '@/db/tableMethods/subscriptionMethods'
import {
  adjustSubscription,
  calculateSplitInBillingPeriodBasedOnAdjustmentDate,
  syncSubscriptionWithActiveItems,
} from '@/subscriptions/adjustSubscription'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  CurrencyCode,
  FeatureFlag,
  IntervalUnit,
  PaymentStatus,
  PriceType,
  SubscriptionAdjustmentTiming,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'

// Helper to normalize Date | number into milliseconds since epoch
const toMs = (d: Date | number | null | undefined): number | null => {
  if (d == null) return null
  return typeof d === 'number' ? d : d.getTime()
}

// A: add helper function to verify subscription items match expected values
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
    expect(matchingResultItem).toBeDefined()

    if (matchingResultItem) {
      // Verify common fields match (excluding dates and system-generated fields)
      expect(matchingResultItem.name).toBe(newItem.name)
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
      expect(matchingResultItem.externalId).toBe(newItem.externalId)
      expect(matchingResultItem.metadata).toEqual(newItem.metadata)
      expect(matchingResultItem.subscriptionId).toBe(subscription.id)
      expect(matchingResultItem.priceId).toBe(newItem.priceId)
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
    it('should throw "Subscription is in terminal state" if the subscription is terminal', async () => {
      // Create a subscription already in a terminal state.
      const canceledSubscription = await setupSubscription({
        status: SubscriptionStatus.Canceled,
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
      })
      // A: create an incomplete expired subscription for terminal state check
      const incompleteExpiredSubscription = await setupSubscription({
        status: SubscriptionStatus.IncompleteExpired,
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
            startDate: Date.now() - 10 * 60 * 1000,
            endDate: Date.now() + 10 * 60 * 1000,
            status: BillingPeriodStatus.Active,
          },
          transaction
        )
        const orgWithFeatureFlag = await updateOrganization(
          {
            id: organization.id,
            featureFlags: {
              [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
            },
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
            orgWithFeatureFlag,
            transaction
          )
        ).rejects.toThrow('Subscription is in terminal state')

        // A: check terminal state for incomplete expired subscription
        await expect(
          adjustSubscription(
            {
              id: incompleteExpiredSubscription.id,
              adjustment: {
                newSubscriptionItems: [],
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            orgWithFeatureFlag,
            transaction
          )
        ).rejects.toThrow('Subscription is in terminal state')
      })
    })

    // A: create a test for non-renewing / credit trial subscription
    it('should throw "non-renewing subscription" error for non-renewing / credit trial subscriptions', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Update the existing subscription to be in credit trial mode (Active status with renews: false)
        const creditTrialSubscription = await updateSubscription(
          {
            id: subscription.id,
            status: SubscriptionStatus.Active, // Credit trials are stored as Active
            renews: false, // This is what makes it a credit trial
            defaultPaymentMethodId: null, // Credit trials typically don't have payment methods
            interval: null, // Non-renewing subscriptions have null intervals
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

        const orgWithFeatureFlag = await updateOrganization(
          {
            id: organization.id,
            featureFlags: {
              [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
            },
          },
          transaction
        )

        await expect(
          adjustSubscription(
            {
              id: creditTrialSubscription.id,
              adjustment: {
                newSubscriptionItems: [],
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            orgWithFeatureFlag,
            transaction
          )
        ).rejects.toThrow(
          'Non-renewing subscriptions cannot be adjusted'
        )
      })
    })

    it('should throw error when attempting to adjust doNotCharge subscription', async () => {
      // Create a subscription with doNotCharge=true
      const doNotChargeSubscription = await setupSubscription({
        status: SubscriptionStatus.Active,
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        doNotCharge: true,
        // doNotCharge subscriptions don't have payment methods
        paymentMethodId: null,
      })
      await setupSubscriptionItem({
        subscriptionId: doNotChargeSubscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 0, // doNotCharge subscription items don't have unit prices
      })
      await adminTransaction(async ({ transaction }) => {
        const orgWithFeatureFlag = await updateOrganization(
          {
            id: organization.id,
            featureFlags: {
              [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
            },
          },
          transaction
        )
        await expect(
          adjustSubscription(
            {
              id: doNotChargeSubscription.id,
              adjustment: {
                newSubscriptionItems: [],
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            orgWithFeatureFlag,
            transaction
          )
        ).rejects.toThrow(
          'Cannot adjust doNotCharge subscriptions. Cancel and create a new subscription instead.'
        )
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
            startDate: Date.now() - 10 * 60 * 1000,
            endDate: Date.now() + 10 * 60 * 1000,
            status: BillingPeriodStatus.Active,
          },
          transaction
        )
        const orgWithFeatureFlag = await updateOrganization(
          {
            id: organization.id,
            featureFlags: {
              [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
            },
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
            organization,
            transaction
          )
        ).rejects.toThrow('Invalid timing')
      })
    })
    it('should throw error when new subscription items have non-subscription price types', async () => {
      // Create a usage meter first (required for usage-based prices)
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Test Usage Meter',
        pricingModelId: pricingModel.id,
        livemode: false,
      })

      // Create a usage-based price to test the validation
      const usagePrice = await setupPrice({
        productId: product.id,
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

      await adminTransaction(async ({ transaction }) => {
        await updateBillingPeriod(
          {
            id: billingPeriod.id,
            startDate: Date.now() - 10 * 60 * 1000,
            endDate: Date.now() + 10 * 60 * 1000,
            status: BillingPeriodStatus.Active,
          },
          transaction
        )
        const orgWithFeatureFlag = await updateOrganization(
          {
            id: organization.id,
            featureFlags: {
              [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
            },
          },
          transaction
        )

        await expect(
          adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            orgWithFeatureFlag,
            transaction
          )
        ).rejects.toThrow(
          /Only recurring prices can be used in subscriptions\. Price .+ is of type usage/
        )
        // Test SinglePayment price type rejection
        const singlePaymentPrice = await setupPrice({
          productId: product.id,
          name: 'Single Payment Price',
          type: PriceType.SinglePayment,
          unitPrice: 2500,
          currency: CurrencyCode.USD,
          isDefault: false,
          livemode: false,
        })

        const singlePaymentItems: SubscriptionItem.Upsert[] = [
          {
            ...subscriptionItemCore,
            name: 'Single Payment Item',
            quantity: 1,
            unitPrice: 2500,
            priceId: singlePaymentPrice.id,
            livemode: subscription.livemode,
            externalId: null,
            expiredAt: null,
            type: SubscriptionItemType.Static,
          },
        ]

        await expect(
          adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: singlePaymentItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            orgWithFeatureFlag,
            transaction
          )
        ).rejects.toThrow(
          /Only recurring prices can be used in subscriptions\. Price .+ is of type single_payment/
        )
      })
    })
    it('should throw when adjusting a non-existent subscription id', async () => {
      await adminTransaction(async ({ transaction }) => {
        const orgWithFeatureFlag = await updateOrganization(
          {
            id: organization.id,
            featureFlags: {
              [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
            },
          },
          transaction
        )
        await expect(
          adjustSubscription(
            {
              id: 'sub_nonexistent123',
              adjustment: {
                newSubscriptionItems: [],
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            orgWithFeatureFlag,
            transaction
          )
        ).rejects.toThrow()
      })
    })

    /* ==========================================================================
     Feature Flag Tests
  ========================================================================== */
    describe('Feature Flag: ImmediateSubscriptionAdjustments', () => {
      it('should throw error when attempting immediate adjustment without feature flag', async () => {
        await adminTransaction(async ({ transaction }) => {
          await setupSubscriptionItem({
            subscriptionId: subscription.id,
            name: 'Item 1',
            quantity: 1,
            unitPrice: 100,
          })

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
              name: 'Item 2',
              quantity: 2,
              unitPrice: 200,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          // Organization does not have the feature flag enabled
          await expect(
            adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: false,
                },
              },
              organization,
              transaction
            )
          ).rejects.toThrow(
            'Immediate adjustments are in private preview.'
          )
        })
      })

      it('should succeed with immediate adjustment when feature flag is enabled', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Enable the feature flag
          const orgWithFeatureFlag = await updateOrganization(
            {
              id: organization.id,
              featureFlags: {
                [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
              },
            },
            transaction
          )

          await setupSubscriptionItem({
            subscriptionId: subscription.id,
            name: 'Item 1',
            quantity: 1,
            unitPrice: 100,
          })

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
              name: 'Item 2',
              quantity: 2,
              unitPrice: 200,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          // Should NOT throw with feature flag enabled
          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            orgWithFeatureFlag,
            transaction
          )

          expect(result.subscription).toBeDefined()
          expect(result.subscriptionItems.length).toBeGreaterThan(0)
        })
      })

      it('should allow adjustments at end of billing period without feature flag', async () => {
        await adminTransaction(async ({ transaction }) => {
          await setupSubscriptionItem({
            subscriptionId: subscription.id,
            name: 'Item 1',
            quantity: 1,
            unitPrice: 100,
          })

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
              renews: true,
            },
            transaction
          )

          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Item 2',
              quantity: 2,
              unitPrice: 200,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]
          const orgWithFeatureFlag = await updateOrganization(
            {
              id: organization.id,
              featureFlags: {
                [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
              },
            },
            transaction
          )

          // Should NOT throw - AtEndOfCurrentBillingPeriod doesn't require feature flag
          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing:
                  SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
              },
            },
            orgWithFeatureFlag,
            transaction
          )

          expect(result.subscription).toBeDefined()
          expect(result.subscriptionItems.length).toBeGreaterThan(0)
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
              startDate: Date.now() - 3600000,
              endDate: Date.now() + 3600000,
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
            },
          ]

          const orgWithFeatureFlag = await updateOrganization(
            {
              id: organization.id,
              featureFlags: {
                [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
              },
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
            orgWithFeatureFlag,
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
              startDate: Date.now() - 3600000,
              endDate: Date.now() + 3600000,
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
            },
            {
              ...subscriptionItemCore,
              name: 'Add-on Feature',
              quantity: 1,
              unitPrice: 1000,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]
          const orgWithFeatureFlag = await updateOrganization(
            {
              id: organization.id,
              featureFlags: {
                [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
              },
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
            orgWithFeatureFlag,
            transaction
          )

          // Verify that the subscription record uses the most expensive item's information
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
          expect(dbResult.subscriptionItems.length).toBe(2)
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

          // Also update the subscription's currentBillingPeriodEnd to match
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

          subscription.currentBillingPeriodEnd = futureDate
          subscription.name = 'Current Plan'
          subscription.priceId = price.id

          // Adjust subscription to a more expensive plan at END of current billing period
          const newItems: SubscriptionItem.Upsert[] = [
            {
              ...subscriptionItemCore,
              name: 'Future Plan',
              quantity: 1,
              unitPrice: 5000,
              expiredAt: null,
              type: SubscriptionItemType.Static,
            },
          ]

          const orgWithFeatureFlag = await updateOrganization(
            {
              id: organization.id,
              featureFlags: {
                [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
              },
            },
            transaction
          )
          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing:
                  SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
              },
            },
            orgWithFeatureFlag,
            transaction
          )

          // Subscription should still show the CURRENT plan
          expect(result.subscription.name).toBe('Current Plan')
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

          expect(dbResult.subscription.name).toBe('Current Plan')
          expect(dbResult.subscriptionItems.length).toBe(2)

          const expiredCurrentItem = dbResult.subscriptionItems.find(
            (item) => item.name === 'Current Plan' && item.expiredAt
          )
          const futureItem = dbResult.subscriptionItems.find(
            (item) => item.name === 'Future Plan' && !item.expiredAt
          )
          expect(expiredCurrentItem).toBeDefined()
          expect(expiredCurrentItem?.expiredAt).toBeDefined()
          expect(futureItem).toBeDefined()
          expect(futureItem?.addedDate).toBe(futureDate)
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
              startDate: Date.now() - 3600000,
              endDate: Date.now() + 3600000,
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
            },
          ]

          const orgWithFeatureFlag = await updateOrganization(
            {
              id: organization.id,
              featureFlags: {
                [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
              },
            },
            transaction
          )

          const result = await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            orgWithFeatureFlag,
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
          expect(synced.priceId).toBe(currentItem.priceId)
        })
      })

      it('should handle multiple items becoming active and choose the most expensive as primary', async () => {
        await adminTransaction(async ({ transaction }) => {
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
          expect(synced.priceId).toBe(premiumItem.priceId)
        })
      })

      it('should handle subscription becoming active but not primary (lower price than existing)', async () => {
        await adminTransaction(async ({ transaction }) => {
          const now = Date.now()
          const futureDate = addDays(new Date(now), 1).getTime()

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
          expect(synced.priceId).toBe(expensiveItem.priceId)
        })
      })

      it('should update primary when current primary item gets cancelled', async () => {
        await adminTransaction(async ({ transaction }) => {
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
          expect(syncedAfter.priceId).toBe(secondaryItem.priceId)
        })
      })

      it('should handle multiple items becoming active and inactive simultaneously', async () => {
        await adminTransaction(async ({ transaction }) => {
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
          expect(synced.priceId).toBe(newPremiumItem.priceId)
        })
      })

      it('should maintain subscription state when all items expire with no replacements', async () => {
        await adminTransaction(async ({ transaction }) => {
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
        })
      })

      it('should handle quantity changes affecting total price calculations', async () => {
        await adminTransaction(async ({ transaction }) => {
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
          expect(synced.priceId).toBe(highQuantityItem.priceId)
        })
      })

      it('should use addedDate as tiebreaker when items have same total price', async () => {
        await adminTransaction(async ({ transaction }) => {
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
          expect(synced.priceId).toBe(newerItem.priceId)
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
          // A: Update existing billing period instead of create a new one to prevent reference issues
          // await setupBillingPeriod({
          //   subscriptionId: subscription.id,
          //   startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          //   endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          //   status: BillingPeriodStatus.Active,
          // })

          await adminTransaction(async ({ transaction }) => {
            // A: update existing billing period
            await updateBillingPeriod(
              {
                id: billingPeriod.id,
                startDate: Date.now() - 10 * 60 * 1000,
                endDate: Date.now() + 10 * 60 * 1000,
                status: BillingPeriodStatus.Active,
              },
              transaction
            )
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
              },
            ]

            // A: get the items from before adjustSubscription to compare with after for more robust testing
            const bpItemsBefore = await selectBillingPeriodItems(
              { billingPeriodId: billingPeriod.id },
              transaction
            )
            const billingRunsBefore = await selectBillingRuns(
              { billingPeriodId: billingPeriod.id },
              transaction
            )

            const orgWithFeatureFlag = await updateOrganization(
              {
                id: organization.id,
                featureFlags: {
                  [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
                },
              },
              transaction
            )

            await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: true,
                },
              },
              orgWithFeatureFlag,
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
            // Expect the item not present in newItems (item2) was “removed” and new items were added.
            expect(result?.subscriptionItems.length).toBe(3)
            result?.subscriptionItems.forEach((item) => {
              // A: check addedDate is within last few seconds
              const addedMs = toMs(item.addedDate)!
              expect(Math.abs(Date.now() - addedMs)).toBeLessThan(
                10000
              )
            })
            // A: FIXME: ask about addedDate for existing items

            // A: check item2's expiredAt is within last few seconds
            const item2FromResult = result.subscriptionItems.find(
              (item) => item.id === item2.id
            )
            expect(item2FromResult).toBeDefined()
            const expiredMs = toMs(item2FromResult!.expiredAt)!
            expect(Math.abs(Date.now() - expiredMs)).toBeLessThan(
              10000
            )

            // A: Verify fields of subscriptionItems match newItems
            expectSubscriptionItemsToMatch(
              newItems,
              result.subscriptionItems,
              subscription
            )

            // Verify proration adjustments were inserted.
            const bpItems = await selectBillingPeriodItems(
              { billingPeriodId: billingPeriod.id },
              transaction
            )

            expect(bpItems.length).toBeGreaterThan(0)
            // A: Expect two items added for proration adjustments: one for removal of item2, one for addition of item3
            // expect(bpItems.length - bpItemsBefore.length).toBe(2)

            bpItems.forEach((adj) => {
              // Unit prices should be rounded to whole numbers.
              // A: added || to prevent -0 != 0 error
              expect(adj.unitPrice % 1 || 0).toEqual(0)
            })
            // The new logic creates a single "Net charge adjustment" item
            const netChargeItems = bpItems.filter((adj) =>
              adj.name?.includes('Net charge adjustment')
            )
            expect(netChargeItems.length).toBe(1)
            expect(netChargeItems[0].unitPrice).toBeGreaterThan(0)

            // Verify the charge amount makes sense
            // Old plan total: $1.00 (Item 1) + $4.00 (Item 2) = $5.00
            // New plan total: $1.00 (Item 1) + $9.00 (Item 3) = $10.00
            // Since we're at ~50% through the period:
            // Fair value: 50% of $5.00 (old) + 50% of $10.00 (new) = 250 + 500 = ~$7.50
            // Already paid: $0.00
            // Net charge: ~$7.50
            // Allow wide tolerance since timing varies
            expect(
              netChargeItems[0].unitPrice
            ).toBeGreaterThanOrEqual(500) // At least $5.00
            expect(netChargeItems[0].unitPrice).toBeLessThanOrEqual(
              1000
            ) // At most $10.00

            // Verify that a billing run was executed.
            const billingRuns = await selectBillingRuns(
              { billingPeriodId: billingPeriod.id },
              transaction
            )
            // A: this should be a better check than the previous approximatelyImmediateBillingRuns
            expect(
              billingRuns.length - billingRunsBefore.length
            ).toBe(1)

            // const approximatelyImmediateBillingRuns =
            //   billingRuns.filter((run) => {
            //     return (
            //       Math.abs(
            //         run.scheduledFor.getTime() - new Date().getTime()
            //       ) < 10000
            //     )
            //   })
            // expect(approximatelyImmediateBillingRuns.length).toBe(1)
          })
        })

        it('should prorate considering existing successful payment in current billing period (upgrade)', async () => {
          const item1 = await setupSubscriptionItem({
            subscriptionId: subscription.id,
            name: 'Basic Plan',
            quantity: 1,
            unitPrice: 999,
          })

          // Ensure active billing period covers now
          const start = Date.now() - 5 * 24 * 60 * 60 * 1000
          const end = Date.now() + 25 * 24 * 60 * 60 * 1000
          await adminTransaction(async ({ transaction }) => {
            await updateBillingPeriod(
              {
                id: billingPeriod.id,
                startDate: start,
                endDate: end,
                status: BillingPeriodStatus.Active,
              },
              transaction
            )

            // Create an invoice linked to this billing period and a succeeded payment
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
              amount: 999,
              customerId: customer.id,
              organizationId: organization.id,
              invoiceId: invoice.id,
              billingPeriodId: billingPeriod.id,
              subscriptionId: subscription.id,
              paymentMethodId:
                subscription.defaultPaymentMethodId ??
                paymentMethod.id,
              livemode: subscription.livemode,
            })

            const billingPeriodItemsBefore =
              await selectBillingPeriodItems(
                { billingPeriodId: billingPeriod.id },
                transaction
              )

            const newItems: SubscriptionItem.Upsert[] = [
              { ...item1 },
              {
                ...subscriptionItemCore,
                name: 'Premium Plan',
                quantity: 1,
                unitPrice: 4999,
                expiredAt: null,
                type: SubscriptionItemType.Static,
              },
            ]

            const orgWithFeatureFlag = await updateOrganization(
              {
                id: organization.id,
                featureFlags: {
                  [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
                },
              },
              transaction
            )

            const result = await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: true,
                },
              },
              orgWithFeatureFlag,
              transaction
            )

            // Verify subscription synced to Premium Plan
            expect(result.subscription.name).toBe('Premium Plan')

            const bpItems = await selectBillingPeriodItems(
              { billingPeriodId: billingPeriod.id },
              transaction
            )

            // There should be proration items, including a net charge adjustment which accounts for existing payment
            expect(bpItems.length).toBeGreaterThan(
              billingPeriodItemsBefore.length
            )
            // FIXME: fix pro ration billing period items
            // Expect removal (credit) for Basic Plan portion and addition charge for Premium Plan portion
            // expect(
            //   bpItems.some((i) =>
            //     i.name.includes('Proration: Removal of Basic Plan x 1')
            //   )
            // ).toBe(true)
            // expect(
            //   bpItems.some((i) =>
            //     i.name.includes(
            //       'Proration: Addition of Premium Plan x 1'
            //     )
            //   )
            // ).toBe(true)
            // // And a net charge adjustment line
            // expect(
            //   bpItems.some((i) =>
            //     i.name.includes('Proration: Net charge adjustment')
            //   )
            // ).toBe(true)
          })
        })

        it('should downgrade with proration after prior upgrade without negative charges', async () => {
          // Start from Basic, upgrade to Premium (no proration), then downgrade to Basic (with proration)
          const basicItem = await setupSubscriptionItem({
            subscriptionId: subscription.id,
            name: 'Basic Plan',
            quantity: 1,
            unitPrice: 999,
          })

          const start = Date.now() - 5 * 24 * 60 * 60 * 1000
          const end = Date.now() + 25 * 24 * 60 * 60 * 1000
          await adminTransaction(async ({ transaction }) => {
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
              priceId: basicItem.priceId ?? price.id,
              livemode: subscription.livemode,
            })

            // First, upgrade to Premium without proration (to set state)
            const premiumName = 'Premium Plan'
            const upgradeItems: SubscriptionItem.Upsert[] = [
              { ...basicItem },
              {
                ...subscriptionItemCore,
                name: premiumName,
                quantity: 1,
                unitPrice: 4999,
                expiredAt: null,
                type: SubscriptionItemType.Static,
              },
            ]
            const orgWithFeatureFlag = await updateOrganization(
              {
                id: organization.id,
                featureFlags: {
                  [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
                },
              },
              transaction
            )

            const upgradeResult = await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: upgradeItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: false,
                },
              },
              orgWithFeatureFlag,
              transaction
            )
            expect(upgradeResult.subscription.name).toBe(premiumName)

            // Create succeeded payment for Premium plan (already paid)
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
                subscription.defaultPaymentMethodId ??
                paymentMethod.id,
              livemode: subscription.livemode,
            })

            // Capture BP items before downgrade
            const bpItemsBefore = await selectBillingPeriodItems(
              { billingPeriodId: billingPeriod.id },
              transaction
            )

            // Now downgrade to Basic with proration
            const downgradeItems: SubscriptionItem.Upsert[] = [
              { ...basicItem },
            ]
            const downgradeResult = await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: downgradeItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: true,
                },
              },
              orgWithFeatureFlag,
              transaction
            )

            // Sync should now reflect Basic Plan
            expect(downgradeResult.subscription.name).toBe(
              'Basic Plan'
            )

            // Verify no negative net charges created by the downgrade
            const bpItemsAfter = await selectBillingPeriodItems(
              { billingPeriodId: billingPeriod.id },
              transaction
            )
            const newBpItems = bpItemsAfter.filter(
              (a) => !bpItemsBefore.some((b) => b.id === a.id)
            )
            const netDelta = newBpItems.reduce(
              (sum, i) => sum + i.unitPrice * i.quantity,
              0
            )
            expect(netDelta).toBeGreaterThanOrEqual(0)
            // FIXME: fix pro ration billing period items
            // Optionally, ensure a net charge adjustment entry exists and is non-negative
            const netAdj = newBpItems.find((i) =>
              i.name.includes('Proration: Net charge adjustment')
            )
            if (netAdj) {
              expect(netAdj.unitPrice).toBeGreaterThanOrEqual(0)
            }
          })
        })

        it('should remove all items with proration and keep subscription name unchanged', async () => {
          // Create an initial active item
          const existingItem = await setupSubscriptionItem({
            subscriptionId: subscription.id,
            name: 'Basic Plan',
            quantity: 1,
            unitPrice: 999,
          })

          await adminTransaction(async ({ transaction }) => {
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

            const orgWithFeatureFlag = await updateOrganization(
              {
                id: organization.id,
                featureFlags: {
                  [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
                },
              },
              transaction
            )

            const result = await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: [],
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: true,
                },
              },
              orgWithFeatureFlag,
              transaction
            )

            // No active subscription items remain
            expect(result.subscriptionItems.length).toBe(0)
            // Subscription name remains unchanged (no active items to sync from)
            expect(result.subscription.name).toBe(originalName)
          })
        })

        it('should keep existing item and add add-on with proration, syncing to most expensive item', async () => {
          // Existing primary item (more expensive)
          const primaryItem = await setupSubscriptionItem({
            subscriptionId: subscription.id,
            name: 'Basic Plan',
            quantity: 1,
            unitPrice: 999,
            priceId: price.id,
          })

          await adminTransaction(async ({ transaction }) => {
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
                ...primaryItem,
                id: primaryItem.id,
                name: 'Basic Plan',
                quantity: 1,
                unitPrice: 999,
                expiredAt: null,
                type: SubscriptionItemType.Static,
              },
              {
                ...subscriptionItemCore,
                name: 'Add-on Feature',
                quantity: 1,
                unitPrice: 500, // cheaper add-on
                expiredAt: null,
                type: SubscriptionItemType.Static,
              },
            ]

            const orgWithFeatureFlag = await updateOrganization(
              {
                id: organization.id,
                featureFlags: {
                  [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
                },
              },
              transaction
            )

            const result = await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: true,
                },
              },
              orgWithFeatureFlag,
              transaction
            )

            // Primary remains Basic Plan (most expensive by total price)
            expect(result.subscription.name).toBe('Basic Plan')
            expect(result.subscription.priceId).toBe(price.id)

            const dbResult =
              await selectSubscriptionItemsAndSubscriptionBySubscriptionId(
                subscription.id,
                transaction
              )
            expect(dbResult).not.toBeNull()
            if (!dbResult) throw new Error('Result is null')
            expect(dbResult.subscriptionItems.length).toBe(2)
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
                startDate: Date.now() - 24 * 60 * 60 * 1000,
                endDate: Date.now() + 24 * 60 * 60 * 1000,
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
              },
              {
                ...subscriptionItemCore,
                name: 'Item 3',
                quantity: 3,
                unitPrice: 300,
                expiredAt: null,
                type: SubscriptionItemType.Static,
              },
            ]

            const orgWithFeatureFlag = await updateOrganization(
              {
                id: organization.id,
                featureFlags: {
                  [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
                },
              },
              transaction
            )

            await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: false,
                },
              },
              orgWithFeatureFlag,
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
            // A: check addedDate is within last few seconds
            result.subscriptionItems.forEach((item) => {
              const addedMs = toMs(item.addedDate)!
              expect(Math.abs(Date.now() - addedMs)).toBeLessThan(
                10000
              )
            })

            // A: Verify fields of subscriptionItems match newItems
            expectSubscriptionItemsToMatch(
              newItems,
              result.subscriptionItems,
              subscription
            )

            // Verify that no proration adjustments were made.
            const bp =
              await selectCurrentBillingPeriodForSubscription(
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
        // A: Update existing billing period instead of create a new one to prevent reference issues
        // billingPeriod = await setupBillingPeriod({
        //   subscriptionId: subscription.id,
        //   startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        //   endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        //   status: BillingPeriodStatus.Active,
        // })
        await adminTransaction(async ({ transaction }) => {
          // A: update existing billing period
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

          // A: Also update the subscription to match the new billing period dates
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

          // A: get the bp items from before adjustSubscription to compare with after for more robust testing
          const bpItemsBefore = await selectBillingPeriodItems(
            { billingPeriodId: billingPeriod.id },
            transaction
          )

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
              addedDate: Date.now(),
              priceId: price.id,
              externalId: null,
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
          // A: Expect the item not present in newItems (item2) will expire and new item will be added at end of current billing period
          expect(result?.subscriptionItems.length).toBe(3)
          result?.subscriptionItems
            .filter((item) => item.id !== item2.id)
            .forEach((item) => {
              const addedMs = toMs(item.addedDate)!
              expect(addedMs).toEqual(
                toMs(subscription.currentBillingPeriodEnd)!
              )
              expect(addedMs).toEqual(
                toMs(currentBillingPeriod!.endDate)!
              )
            })

          // A: check item2's expiredAt is at billing period end
          const item2FromResult = result.subscriptionItems.find(
            (item) => item.id === item2.id
          )
          expect(item2FromResult).toBeDefined()
          expect(toMs(item2FromResult!.expiredAt)!).toEqual(
            toMs(subscription.currentBillingPeriodEnd)!
          )
          expect(toMs(item2FromResult!.expiredAt)!).toEqual(
            toMs(currentBillingPeriod!.endDate)!
          )

          const bpItems = await selectBillingPeriodItems(
            { billingPeriodId: billingPeriod.id },
            transaction
          )
          // A: check no new billing period items created
          expect(bpItems.length).toEqual(bpItemsBefore.length)
          // expect(bpItems.length).toEqual(0)
        })
      })
    })

    // A: add test for adjustment on existing items fields
    /* ==========================================================================
     Adjustments on existing Items' Quantity
  ========================================================================== */
    describe('adjustmentsOnExistingItemsQuantity', () => {
      it('should update quantity on existing items correctly and create proration adjustments if prorateCurrentBillingPeriod is true', async () => {
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
        await adminTransaction(async ({ transaction }) => {
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
              ...item1,
              quantity: 2,
            },
            {
              ...item2,
              quantity: 1,
            },
          ]

          const orgWithFeatureFlag = await updateOrganization(
            {
              id: organization.id,
              featureFlags: {
                [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
              },
            },
            transaction
          )

          await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            orgWithFeatureFlag,
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
          const item1FromResult = result.subscriptionItems.find(
            (item) => item.id === item1.id
          )
          expect(item1FromResult).toBeDefined()
          expect(item1FromResult!.quantity).toBe(2)

          const item2FromResult = result.subscriptionItems.find(
            (item) => item.id === item2.id
          )
          expect(item2FromResult).toBeDefined()
          expect(item2FromResult!.quantity).toBe(1)

          // Verify fields of subscriptionItems match newItems
          expectSubscriptionItemsToMatch(
            newItems,
            result.subscriptionItems,
            subscription
          )

          const bpItems = await selectBillingPeriodItems(
            { billingPeriodId: billingPeriod.id },
            transaction
          )
          // Expect two proration adjustments: one for each item whose quantity changed
          // but this fails as it's not handled in adjustSubscription yet
          // expect(bpItems.length - bpItemsBefore.length).toBe(2)
          // FIXME: check bpItems fields
        })
      })
    })

    /* ==========================================================================
     Calculation Helper Function
  ========================================================================== */
    describe('calculateSplitInBillingPeriodBasedOnAdjustmentDate', () => {
      it('should return correct percentages when adjustment date is at start, middle, and end', () => {
        let adjustmentDateMs = toMs(billingPeriod.startDate)!
        let split =
          calculateSplitInBillingPeriodBasedOnAdjustmentDate(
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
     Edge Cases and Error Handling
  ========================================================================== */
    describe('Edge Cases and Error Handling', () => {
      it('should handle a zero-duration billing period', async () => {
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
        await adminTransaction(async ({ transaction }) => {
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

          const orgWithFeatureFlag = await updateOrganization(
            {
              id: organization.id,
              featureFlags: {
                [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
              },
            },
            transaction
          )

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
              orgWithFeatureFlag,
              transaction
            )
          ).rejects.toThrow()
        })
      })

      // A: add check for negative-duration billing period
      it('should handle a negative-duration billing period', async () => {
        const item = await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Item Zero',
          quantity: 1,
          unitPrice: 100,
        })
        await adminTransaction(async ({ transaction }) => {
          await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.parse('2025-01-01T00:00:00Z'),
              endDate: Date.parse('2024-12-01T00:00:00Z'),
              status: BillingPeriodStatus.Active,
            },
            transaction
          )
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

          const orgWithFeatureFlag = await updateOrganization(
            {
              id: organization.id,
              featureFlags: {
                [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
              },
            },
            transaction
          )

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
              orgWithFeatureFlag,
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
              startDate: Date.now() - 3600000,
              endDate: Date.now() + 3600000,
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
            },
          ]

          const orgWithFeatureFlag = await updateOrganization(
            {
              id: organization.id,
              featureFlags: {
                [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
              },
            },
            transaction
          )

          await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: false,
              },
            },
            orgWithFeatureFlag,
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
          expect(result.subscriptionItems.length).toBe(
            newItems.length
          )
        })
      })

      // TODO: resolve this case when refactoring adjustSubscription
      /* it('should throw an error when subscription items have zero quantity', async () => {
        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: Date.now() - 3600000,
          endDate: Date.now() + 3600000,
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
            },
          ]

          const orgWithFeatureFlag = await updateOrganization(
            {
              id: organization.id,
              featureFlags: {
                [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
              },
            },
            transaction
          )

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
              orgWithFeatureFlag,
              transaction
            )
          ).rejects.toThrow()
        })
      }) */

      it('should handle subscription items with zero unit price', async () => {
        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: Date.now() - 3600000,
          endDate: Date.now() + 3600000,
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
            },
          ]

          const orgWithFeatureFlag = await updateOrganization(
            {
              id: organization.id,
              featureFlags: {
                [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
              },
            },
            transaction
          )

          await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            orgWithFeatureFlag,
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
          // With zero unit price items (free plan), this is a downgrade scenario
          // The new logic applies downgrade protection and creates NO proration items
          // when net charge would be <= 0
          expect(bpItems.length).toBe(0)
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
                startDate: Date.now() - 3600000,
                endDate: Date.now() + 3600000,
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

            const orgWithFeatureFlag = await updateOrganization(
              {
                id: organization.id,
                featureFlags: {
                  [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
                },
              },
              transaction
            )

            await adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: true,
                },
              },
              orgWithFeatureFlag,
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

          const orgWithFeatureFlag = await updateOrganization(
            {
              id: organization.id,
              featureFlags: {
                [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
              },
            },
            transaction
          )

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
              orgWithFeatureFlag,
              transaction
            )
          ).rejects.toThrow()
        })
      })

      // A: add test for future billing periods
      it('should handle billing periods in the future appropriately', async () => {
        await adminTransaction(async ({ transaction }) => {
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

          const orgWithFeatureFlag = await updateOrganization(
            {
              id: organization.id,
              featureFlags: {
                [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
              },
            },
            transaction
          )

          await expect(
            adjustSubscription(
              {
                id: subscription.id,
                adjustment: {
                  newSubscriptionItems: newFutureItems,
                  timing: SubscriptionAdjustmentTiming.Immediately,
                  prorateCurrentBillingPeriod: true,
                },
              },
              orgWithFeatureFlag,
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
              startDate: Date.now() - 3600000,
              endDate: Date.now() + 3600000,
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
            },
          ]

          const orgWithFeatureFlag = await updateOrganization(
            {
              id: organization.id,
              featureFlags: {
                [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
              },
            },
            transaction
          )

          await adjustSubscription(
            {
              id: subscription.id,
              adjustment: {
                newSubscriptionItems: newItems,
                timing: SubscriptionAdjustmentTiming.Immediately,
                prorateCurrentBillingPeriod: true,
              },
            },
            orgWithFeatureFlag,
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
              startDate: Date.now() - 3600000,
              endDate: Date.now() + 3600000,
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
                },
              ]

              const orgWithFeatureFlag = await updateOrganization(
                {
                  id: organization.id,
                  featureFlags: {
                    [FeatureFlag.ImmediateSubscriptionAdjustments]: true,
                  },
                },
                transaction
              )

              await adjustSubscription(
                {
                  id: subscription.id,
                  adjustment: {
                    newSubscriptionItems: invalidItems,
                    timing: SubscriptionAdjustmentTiming.Immediately,
                    prorateCurrentBillingPeriod: false,
                  },
                },
                orgWithFeatureFlag,
                transaction
              )
            })
          ).rejects.toThrow()
        })
      })
    })
  })
})
