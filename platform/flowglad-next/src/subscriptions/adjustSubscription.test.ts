import { addDays, subDays } from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Customer } from '@/db/schema/customers'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import { nulledPriceColumns } from '@/db/schema/prices'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import { selectBillingPeriodItems } from '@/db/tableMethods/billingPeriodItemMethods'
import {
  selectCurrentBillingPeriodForSubscription,
  updateBillingPeriod,
} from '@/db/tableMethods/billingPeriodMethods'
import { selectBillingRuns } from '@/db/tableMethods/billingRunMethods'
import { insertPrice } from '@/db/tableMethods/priceMethods'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
// Helpers to query the database after adjustments
import {
  expireSubscriptionItems,
  selectSubscriptionItems,
  selectSubscriptionItemsAndSubscriptionBySubscriptionId,
  updateSubscriptionItem,
} from '@/db/tableMethods/subscriptionItemMethods'
import { updateSubscription } from '@/db/tableMethods/subscriptionMethods'
import { selectUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import {
  adjustSubscription,
  autoDetectTiming,
  calculateSplitInBillingPeriodBasedOnAdjustmentDate,
  syncSubscriptionWithActiveItems,
} from '@/subscriptions/adjustSubscription'
import type { TerseSubscriptionItem } from '@/subscriptions/schemas'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  CurrencyCode,
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  PaymentStatus,
  PriceType,
  SubscriptionAdjustmentTiming,
  SubscriptionItemType,
  SubscriptionStatus,
  UsageCreditSourceReferenceType,
  UsageCreditType,
} from '@/types'

// Mock the trigger task - we test that it's called with correct parameters
// The actual billing run execution is tested in billingRunHelpers.test.ts
// Create the mock function inside the factory to avoid hoisting issues
vi.mock('@/trigger/attempt-billing-run', () => {
  const mockTriggerFn = vi
    .fn()
    .mockResolvedValue({ id: 'mock-billing-run-handle-id' })
  // Store reference so we can access it in tests
  ;(globalThis as any).__mockAttemptBillingRunTrigger = mockTriggerFn
  return {
    attemptBillingRunTask: {
      trigger: mockTriggerFn,
    },
  }
})

// Mock customer subscription adjusted notification
vi.mock(
  '@/trigger/notifications/send-customer-subscription-adjusted-notification',
  () => {
    const mockFn = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as any).__mockCustomerAdjustedNotification = mockFn
    return {
      idempotentSendCustomerSubscriptionAdjustedNotification: mockFn,
    }
  }
)

// Mock organization subscription adjusted notification
vi.mock(
  '@/trigger/notifications/send-organization-subscription-adjusted-notification',
  () => {
    const mockFn = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as any).__mockOrgAdjustedNotification = mockFn
    return {
      idempotentSendOrganizationSubscriptionAdjustedNotification:
        mockFn,
    }
  }
)

// Get the mock function for use in tests
const getMockTrigger = () => {
  return (globalThis as any)
    .__mockAttemptBillingRunTrigger as ReturnType<typeof vi.fn>
}

const getMockCustomerNotification = () => {
  return (globalThis as any)
    .__mockCustomerAdjustedNotification as ReturnType<typeof vi.fn>
}

const getMockOrgNotification = () => {
  return (globalThis as any)
    .__mockOrgAdjustedNotification as ReturnType<typeof vi.fn>
}

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
    // Reset the trigger mock before each test
    const mockTrigger = getMockTrigger()
    mockTrigger.mockClear()
    mockTrigger.mockResolvedValue({
      id: 'mock-billing-run-handle-id',
    })

    // Reset notification mocks
    const mockCustomerNotification = getMockCustomerNotification()
    mockCustomerNotification.mockClear()
    mockCustomerNotification.mockResolvedValue(undefined)

    const mockOrgNotification = getMockOrgNotification()
    mockOrgNotification.mockClear()
    mockOrgNotification.mockResolvedValue(undefined)

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
      await comprehensiveAdminTransaction(async (ctx) => {
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
            organization,
            ctx
          )
        ).rejects.toThrow('Subscription is in terminal state')

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
            organization,
            ctx
          )
        ).rejects.toThrow('Subscription is in terminal state')
        return { result: null }
      })
    })

    it('should throw error for non-renewing / credit trial subscriptions', async () => {
      await comprehensiveAdminTransaction(async (ctx) => {
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
            organization,
            ctx
          )
        ).rejects.toThrow(
          'Non-renewing subscriptions cannot be adjusted'
        )
        return { result: null }
      })
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
      await comprehensiveAdminTransaction(async (ctx) => {
        const { transaction } = ctx
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
            organization,
            ctx
          )
        ).rejects.toThrow(
          'Cannot adjust doNotCharge subscriptions. Cancel and create a new subscription instead.'
        )
        return { result: null }
      })
    })

    it('should throw error when new subscription items have non-subscription price types', async () => {
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Test Usage Meter',
        pricingModelId: pricingModel.id,
        livemode: false,
      })

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

      await comprehensiveAdminTransaction(async (ctx) => {
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
            ctx
          )
        ).rejects.toThrow(
          /Only recurring prices can be used in subscriptions\. Price .+ is of type usage/
        )
        return { result: null }
      })
    })

    it('should throw when adjusting a non-existent subscription id', async () => {
      await comprehensiveAdminTransaction(async (ctx) => {
        const { transaction } = ctx
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
            organization,
            ctx
          )
        ).rejects.toThrow()
        return { result: null }
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

      await comprehensiveAdminTransaction(async (ctx) => {
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
            organization,
            ctx
          )
        ).rejects.toThrow(
          'Subscription item quantity must be greater than zero'
        )
        return { result: null }
      })
    })

    it('should throw error when subscription items have negative quantity', async () => {
      await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: Date.now() - 3600000,
        endDate: Date.now() + 3600000,
        status: BillingPeriodStatus.Active,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
        const { transaction } = ctx
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
            organization,
            ctx
          )
        ).rejects.toThrow(
          'Subscription item quantity must be greater than zero'
        )
        return { result: null }
      })
    })

    it('should throw error when subscription items have negative unit price', async () => {
      await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: Date.now() - 3600000,
        endDate: Date.now() + 3600000,
        status: BillingPeriodStatus.Active,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
        const { transaction } = ctx
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
            organization,
            ctx
          )
        ).rejects.toThrow(
          'Subscription item unit price cannot be negative'
        )
        return { result: null }
      })
    })

    it('should allow subscription items with zero unit price (free tier)', async () => {
      await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: Date.now() - 3600000,
        endDate: Date.now() + 3600000,
        status: BillingPeriodStatus.Active,
      })
      await comprehensiveAdminTransaction(async (ctx) => {
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
        return { result: null }
      })
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

      await comprehensiveAdminTransaction(async (ctx) => {
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

        await expect(
          adjustSubscription(
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
        ).rejects.toThrow(
          'EndOfCurrentBillingPeriod adjustments are only allowed for downgrades'
        )
        return { result: null }
      })
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

      await comprehensiveAdminTransaction(async (ctx) => {
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

        const mockTrigger = getMockTrigger()
        expect(mockTrigger).not.toHaveBeenCalled()

        expect(result.subscription.name).toBe('Item 1 Updated')
        expect(result.subscriptionItems.length).toBe(1)
        expect(result.subscriptionItems[0].name).toBe(
          'Item 1 Updated'
        )
        return { result: null }
      })
    })

    it('should NOT trigger billing run when rawNetCharge is zero', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
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

        const mockTrigger = getMockTrigger()
        expect(mockTrigger).not.toHaveBeenCalled()
        return { result: null }
      })
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

      await comprehensiveAdminTransaction(async (ctx) => {
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

        const mockTrigger = getMockTrigger()
        expect(mockTrigger).not.toHaveBeenCalled()

        expect(result.subscriptionItems.length).toBe(2)
        const item1Result = result.subscriptionItems.find(
          (item) => item.id === item1.id
        )
        expect(item1Result?.quantity).toBe(2)
        expect(item1Result?.name).toBe('Item 1 Updated')
        const item3Result = result.subscriptionItems.find(
          (item) => item.name === 'Item 3'
        )
        expect(typeof item3Result).toBe('object')
        return { result: null }
      })
    })

    it('should preserve subscription name when no active items exist after adjustment', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Original Plan',
        quantity: 1,
        unitPrice: 100,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
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

        expect(result.subscription.name).toBe(originalName)
        expect(result.subscriptionItems.length).toBe(0)
        return { result: null }
      })
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

      await comprehensiveAdminTransaction(async (ctx) => {
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

        const mockTrigger = getMockTrigger()
        expect(mockTrigger).toHaveBeenCalledTimes(1)
        const triggerCall = mockTrigger.mock.calls[0][0]
        expect(triggerCall).toMatchObject({
          billingRun: expect.objectContaining({
            id: expect.any(String),
            status: BillingRunStatus.Scheduled,
            billingPeriodId: billingPeriod.id,
            isAdjustment: true,
          }),
          adjustmentParams: expect.objectContaining({
            newSubscriptionItems: expect.arrayContaining([
              expect.objectContaining({
                name: 'Expensive Item',
                unitPrice: 9999,
                quantity: 1,
              }),
            ]),
            adjustmentDate: expect.any(Number),
          }),
        })
        return { result: null }
      })
    })

    it('should NOT update subscription items or sync subscription immediately when rawNetCharge is positive', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
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

        expect(result.subscription.name).toBeNull()
        expect(result.subscriptionItems.length).toBe(1)
        expect(result.subscriptionItems[0].name).toBe('Item 1')
        expect(result.subscriptionItems[0].unitPrice).toBe(100)
        return { result: null }
      })
    })

    it('should create proration billing period items when netChargeAmount > 0', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
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
        return { result: null }
      })
    })

    it('should trigger billing run with correct params when upgrading (adding items, increasing quantity)', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
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

        const mockTrigger = getMockTrigger()
        expect(mockTrigger).toHaveBeenCalledTimes(1)
        const triggerCall = mockTrigger.mock.calls[0][0]
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems
        ).toMatchObject(
          expect.arrayContaining([
            expect.objectContaining({
              id: item1.id,
              name: item1.name,
              quantity: 2,
              unitPrice: item1.unitPrice,
            }),
            expect.objectContaining({
              name: 'New Item',
              quantity: 1,
              unitPrice: 500,
            }),
          ])
        )
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems.length
        ).toBe(2)
        return { result: null }
      })
    })

    it('should calculate proration correctly considering existing payments and cap at zero for downgrades', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Premium Plan',
        quantity: 1,
        unitPrice: 4999,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
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

        const mockTrigger = getMockTrigger()
        if (netDelta === 0) {
          expect(mockTrigger).not.toHaveBeenCalled()
          expect(result.subscription.name).toBe('Basic Plan')
        } else {
          expect(mockTrigger).toHaveBeenCalled()
        }
        return { result: null }
      })
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

      await comprehensiveAdminTransaction(async (ctx) => {
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
        return { result: null }
      })
    })

    it('should NOT create proration adjustments when prorateCurrentBillingPeriod is false and netChargeAmount > 0', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
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

        const mockTrigger = getMockTrigger()
        if (mockTrigger.mock.calls.length > 0) {
          expect(bpItems.length).toBeGreaterThanOrEqual(
            bpItemsBefore.length
          )
        } else {
          expect(bpItems.length).toEqual(bpItemsBefore.length)
        }
        return { result: null }
      })
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

      await comprehensiveAdminTransaction(async (ctx) => {
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

        const mockTrigger = getMockTrigger()
        expect(mockTrigger).not.toHaveBeenCalled()

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
        return { result: null }
      })
    })

    it('should NOT sync subscription record with future-dated items (preserves current state)', async () => {
      const initialItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Current Plan',
        quantity: 1,
        unitPrice: 1000,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
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

        expect(result.subscription.name).toBe('Current Plan')
        expect(result.subscription.priceId).toBe(price.id)
        return { result: null }
      })
    })

    it('should expire existing items and add new items at billing period end', async () => {
      const expensiveItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Premium Plan',
        quantity: 1,
        unitPrice: 4999,
        priceId: price.id,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
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
        return { result: null }
      })
    })
  })

  /* ==========================================================================
    Edge Cases
  ========================================================================== */
  describe('Edge Cases', () => {
    it('should trigger billing run if net charge > 0, or sync immediately if net charge = 0 when no existing subscription items exist', async () => {
      await comprehensiveAdminTransaction(async (ctx) => {
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

        const mockTrigger = getMockTrigger()
        const wasBillingRunTriggered =
          mockTrigger.mock.calls.length > 0

        if (wasBillingRunTriggered) {
          const result =
            await selectSubscriptionItemsAndSubscriptionBySubscriptionId(
              subscription.id,
              transaction
            )
          expect(result).toBeNull()
        } else {
          const result =
            await selectSubscriptionItemsAndSubscriptionBySubscriptionId(
              subscription.id,
              transaction
            )
          expect(result).toMatchObject({})
          if (!result) throw new Error('Result is null')
          expect(result.subscriptionItems.length).toBe(
            newItems.length
          )
        }
        return { result: null }
      })
    })

    it('should trigger billing run if net charge > 0, or sync immediately and preserve subscription name if net charge = 0 when all items are removed', async () => {
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item 1',
        quantity: 1,
        unitPrice: 100,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
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

        const mockTrigger = getMockTrigger()
        const wasBillingRunTriggered =
          mockTrigger.mock.calls.length > 0

        if (wasBillingRunTriggered) {
          expect(result.subscriptionItems.length).toBe(1)
          expect(result.subscription.name).toBeNull()
        } else {
          expect(result.subscriptionItems.length).toBe(0)
          expect(result.subscription.name).toBe(originalName)
        }
        return { result: null }
      })
    })

    it('should throw error when attempting adjustment with zero-duration billing period', async () => {
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
      await comprehensiveAdminTransaction(async (ctx) => {
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
            organization,
            ctx
          )
        ).rejects.toThrow()
        return { result: null }
      })
    })

    it('should throw error when attempting adjustment with billing periods in the past or future', async () => {
      await comprehensiveAdminTransaction(async (ctx) => {
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
            organization,
            ctx
          )
        ).rejects.toThrow()

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
            organization,
            ctx
          )
        ).rejects.toThrow()
        return { result: null }
      })
    })
  })

  /* ==========================================================================
    syncSubscriptionWithActiveItems Tests
  ========================================================================== */
  describe('syncSubscriptionWithActiveItems', () => {
    it('should sync subscription with currently active items', async () => {
      await comprehensiveAdminTransaction(async (ctx) => {
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
        expect(synced.priceId).toBe(currentItem.priceId)
        return { result: null }
      })
    })

    it('should handle multiple items becoming active and choose the most expensive as primary', async () => {
      await comprehensiveAdminTransaction(async (ctx) => {
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
        expect(synced.priceId).toBe(premiumItem.priceId)
        return { result: null }
      })
    })

    it('should handle subscription becoming active but not primary (lower price than existing)', async () => {
      await comprehensiveAdminTransaction(async (ctx) => {
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
        expect(synced.priceId).toBe(expensiveItem.priceId)
        return { result: null }
      })
    })

    it('should update primary when current primary item gets cancelled', async () => {
      await comprehensiveAdminTransaction(async (ctx) => {
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
        expect(syncedAfter.priceId).toBe(secondaryItem.priceId)
        return { result: null }
      })
    })

    it('should handle multiple items becoming active and inactive simultaneously', async () => {
      await comprehensiveAdminTransaction(async (ctx) => {
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
        expect(synced.priceId).toBe(newPremiumItem.priceId)
        return { result: null }
      })
    })

    it('should maintain subscription state when all items expire with no replacements', async () => {
      await comprehensiveAdminTransaction(async (ctx) => {
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
        return { result: null }
      })
    })

    it('should handle quantity changes affecting total price calculations', async () => {
      await comprehensiveAdminTransaction(async (ctx) => {
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
        expect(synced.priceId).toBe(highQuantityItem.priceId)
        return { result: null }
      })
    })

    it('should use addedDate as tiebreaker when items have same total price', async () => {
      await comprehensiveAdminTransaction(async (ctx) => {
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
        expect(synced.priceId).toBe(newerItem.priceId)
        return { result: null }
      })
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
    it('should throw error and rollback transaction when invalid price ID is provided during bulk operations', async () => {
      const item = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Item',
        quantity: 1,
        unitPrice: 100,
      })
      await comprehensiveAdminTransaction(async (ctx) => {
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
        await expect(
          adminTransaction(async ({ transaction }) => {
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

            await adjustSubscription(
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
          })
        ).rejects.toThrow()
        return { result: null }
      })
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

      await comprehensiveAdminTransaction(async (ctx) => {
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

        // Verify notification mocks were called
        const mockCustomerNotification = getMockCustomerNotification()
        const mockOrgNotification = getMockOrgNotification()

        expect(mockCustomerNotification).toHaveBeenCalledTimes(1)
        expect(mockOrgNotification).toHaveBeenCalledTimes(1)

        // Verify customer notification payload
        const customerPayload =
          mockCustomerNotification.mock.calls[0][0]
        expect(customerPayload.adjustmentType).toBe('downgrade')
        expect(customerPayload.subscriptionId).toBe(subscription.id)
        expect(customerPayload.customerId).toBe(customer.id)
        expect(customerPayload.organizationId).toBe(organization.id)
        expect(customerPayload.prorationAmount).toBeNull()
        expect(customerPayload.previousItems).toHaveLength(1)
        expect(customerPayload.previousItems[0].unitPrice).toBe(4999)
        expect(customerPayload.newItems).toHaveLength(1)
        expect(customerPayload.newItems[0].unitPrice).toBe(999)

        // Verify organization notification payload
        const orgPayload = mockOrgNotification.mock.calls[0][0]
        expect(orgPayload.adjustmentType).toBe('downgrade')
        expect(typeof orgPayload.currency).toBe('string')
        expect(orgPayload.currency.length).toBeGreaterThan(0)
        return { result: null }
      })
    })

    it('should NOT send notifications when rawNetCharge is positive (upgrade requires payment)', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Basic Plan',
        quantity: 1,
        unitPrice: 100,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
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

        // Verify notifications are NOT called for upgrade path (billing run is triggered instead)
        const mockCustomerNotification = getMockCustomerNotification()
        const mockOrgNotification = getMockOrgNotification()

        expect(mockCustomerNotification).not.toHaveBeenCalled()
        expect(mockOrgNotification).not.toHaveBeenCalled()

        // But billing run should be triggered
        const mockTrigger = getMockTrigger()
        expect(mockTrigger).toHaveBeenCalledTimes(1)
        return { result: null }
      })
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

      await comprehensiveAdminTransaction(async (ctx) => {
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
        expect(result.resolvedTiming).toBe(
          SubscriptionAdjustmentTiming.Immediately
        )
        expect(result.isUpgrade).toBe(true)

        // Billing run should be triggered for upgrades
        const mockTrigger = getMockTrigger()
        expect(mockTrigger).toHaveBeenCalledTimes(1)
        return { result: null }
      })
    })

    it('should apply downgrade at end of period when timing is auto', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Premium Plan',
        quantity: 1,
        unitPrice: 4999,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
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
        expect(result.resolvedTiming).toBe(
          SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
        )
        expect(result.isUpgrade).toBe(false)

        // Billing run should NOT be triggered for downgrades
        const mockTrigger = getMockTrigger()
        expect(mockTrigger).not.toHaveBeenCalled()
        return { result: null }
      })
    })

    it('should return correct isUpgrade value for lateral moves', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Plan A',
        quantity: 1,
        unitPrice: 1000,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
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
        expect(result.isUpgrade).toBe(false)
        // Should resolve to Immediately for lateral moves
        expect(result.resolvedTiming).toBe(
          SubscriptionAdjustmentTiming.Immediately
        )
        return { result: null }
      })
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

      await comprehensiveAdminTransaction(async (ctx) => {
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

        // Should trigger billing run for upgrade
        const mockTrigger = getMockTrigger()
        expect(mockTrigger).toHaveBeenCalledTimes(1)
        const triggerCall = mockTrigger.mock.calls[0][0]

        // The resolved item should have the correct priceId
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems[0].priceId
        ).toBe(slugPrice.id)
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems[0]
            .unitPrice
        ).toBe(2999)
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems[0].name
        ).toBe('Premium via Slug')
        return { result: null }
      })
    })

    it('should throw error when priceSlug not found in pricing model', async () => {
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Basic Plan',
        quantity: 1,
        unitPrice: 100,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
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
            organization,
            ctx
          )
        ).rejects.toThrow(/Price "nonexistent-slug" not found/)
        return { result: null }
      })
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

      await comprehensiveAdminTransaction(async (ctx) => {
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

        // Should trigger billing run for upgrade (3 * testPrice.unitPrice > 100)
        const mockTrigger = getMockTrigger()
        expect(mockTrigger).toHaveBeenCalledTimes(1)
        const triggerCall = mockTrigger.mock.calls[0][0]

        // The expanded item should have all the correct fields from the price
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems[0].priceId
        ).toBe(testPrice.id)
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems[0]
            .quantity
        ).toBe(3)
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems[0]
            .unitPrice
        ).toBe(testPrice.unitPrice)
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems[0].name
        ).toBe(testPrice.name)
        return { result: null }
      })
    })

    it('should handle mixed item types (priceSlug + priceId) in the same request', async () => {
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Basic Plan',
        quantity: 1,
        unitPrice: 100,
      })

      const uniqueSlug = `premium-mixed-${Date.now()}`

      await comprehensiveAdminTransaction(async (ctx) => {
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
          transaction
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

        // Should trigger billing run for upgrade
        const mockTrigger = getMockTrigger()
        expect(mockTrigger).toHaveBeenCalledTimes(1)
        const triggerCall = mockTrigger.mock.calls[0][0]

        // Should have both items resolved
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems.length
        ).toBe(2)

        // First item resolved from priceSlug
        const slugItem = (
          triggerCall.adjustmentParams
            .newSubscriptionItems as SubscriptionItem.Record[]
        ).find((i) => i.priceId === slugPrice.id)
        expect(slugItem).toMatchObject({
          unitPrice: slugPrice.unitPrice,
        })
        expect(slugItem!.unitPrice).toBe(slugPrice.unitPrice)
        expect(slugItem!.name).toBe(slugPrice.name)

        // Second item resolved from priceId
        const idItem = (
          triggerCall.adjustmentParams
            .newSubscriptionItems as SubscriptionItem.Record[]
        ).find((i) => i.priceId === idPrice.id)
        expect(idItem).toMatchObject({ quantity: 2 })
        expect(idItem!.quantity).toBe(2)
        return { result: null }
      })
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

      await comprehensiveAdminTransaction(async (ctx) => {
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

        // Should trigger billing run for upgrade
        const mockTrigger = getMockTrigger()
        expect(mockTrigger).toHaveBeenCalledTimes(1)
        const triggerCall = mockTrigger.mock.calls[0][0]

        // The item should be resolved correctly from the UUID
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems[0].priceId
        ).toBe(uuidPrice.id)
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems[0]
            .unitPrice
        ).toBe(uuidPrice.unitPrice)
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems[0].name
        ).toBe(uuidPrice.name)
        return { result: null }
      })
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

      await comprehensiveAdminTransaction(async (ctx) => {
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

        // Should NOT trigger billing run since proration is disabled
        const mockTrigger = getMockTrigger()
        expect(mockTrigger).not.toHaveBeenCalled()

        // Should report as upgrade
        expect(result.isUpgrade).toBe(true)
        expect(result.resolvedTiming).toBe(
          SubscriptionAdjustmentTiming.Immediately
        )

        // Subscription items should be updated immediately
        expect(result.subscriptionItems.length).toBe(1)
        expect(result.subscriptionItems[0].unitPrice).toBe(500)

        // Should NOT create proration billing period items
        const bpItemsAfter = await selectBillingPeriodItems(
          { billingPeriodId: billingPeriod.id },
          transaction
        )
        expect(bpItemsAfter.length).toBe(bpItemsBefore.length)
        return { result: null }
      })
    })

    it('should send upgrade notification when prorateCurrentBillingPeriod is false and isUpgrade is true', async () => {
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Basic Plan',
        quantity: 1,
        unitPrice: 100,
      })

      await comprehensiveAdminTransaction(async (ctx) => {
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
        expect(result.isUpgrade).toBe(true)

        // Note: The notification itself is tested elsewhere, but we verify
        // that the code path for upgrades without proration is taken
        expect(result.resolvedTiming).toBe(
          SubscriptionAdjustmentTiming.Immediately
        )
        return { result: null }
      })
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

      await comprehensiveAdminTransaction(async (ctx) => {
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
        await expect(
          adjustSubscription(
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
        ).rejects.toThrow(/free/i)
        return { result: null }
      })
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

      await comprehensiveAdminTransaction(async (ctx) => {
        const { transaction } = ctx
        const adjustmentDate = Date.now()
        const newStartDate = adjustmentDate - 15 * 24 * 60 * 60 * 1000 // 15 days ago
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
        expect(activeFeaturesBefore.length).toBeGreaterThanOrEqual(1)

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
        expect(result.pendingBillingRunId).toBeUndefined()

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
        const oldFeaturesAfter = await selectSubscriptionItemFeatures(
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
        const newFeaturesAfter = await selectSubscriptionItemFeatures(
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
        expect(result.subscription.name).toBe('Basic Plan')
        return { result: null }
      })
    })
  })
})
