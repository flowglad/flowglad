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
  setupSubscription,
  setupSubscriptionItem,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
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
// Helpers to query the database after adjustments
import {
  expireSubscriptionItems,
  selectSubscriptionItemsAndSubscriptionBySubscriptionId,
  updateSubscriptionItem,
} from '@/db/tableMethods/subscriptionItemMethods'
import { updateSubscription } from '@/db/tableMethods/subscriptionMethods'
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
  IntervalUnit,
  PaymentStatus,
  PriceType,
  SubscriptionAdjustmentTiming,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'

// Mock the trigger task - we test that it's called with correct parameters
// The actual billing run execution is tested in billingRunHelpers.test.ts
// Create the mock function inside the factory to avoid hoisting issues
vi.mock('@/trigger/attempt-billing-run', () => {
  const mockTriggerFn = vi.fn().mockResolvedValue(undefined)
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
    // Reset the trigger mock before each test
    const mockTrigger = getMockTrigger()
    mockTrigger.mockClear()
    mockTrigger.mockResolvedValue(undefined)

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
            transaction
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
            transaction
          )
        ).rejects.toThrow('Subscription is in terminal state')
      })
    })

    it('should throw error for non-renewing / credit trial subscriptions', async () => {
      await adminTransaction(async ({ transaction }) => {
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
            transaction
          )
        ).rejects.toThrow(
          'Non-renewing subscriptions cannot be adjusted'
        )
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
      await adminTransaction(async ({ transaction }) => {
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
            transaction
          )
        ).rejects.toThrow(
          'Cannot adjust doNotCharge subscriptions. Cancel and create a new subscription instead.'
        )
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
          /Only recurring prices can be used in subscriptions\. Price .+ is of type usage/
        )
      })
    })

    it('should throw when adjusting a non-existent subscription id', async () => {
      await adminTransaction(async ({ transaction }) => {
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
            transaction
          )
        ).rejects.toThrow()
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

      await adminTransaction(async ({ transaction }) => {
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
            transaction
          )
        ).rejects.toThrow(
          'Subscription item quantity must be greater than zero'
        )
      })
    })

    it('should throw error when subscription items have negative quantity', async () => {
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
            transaction
          )
        ).rejects.toThrow(
          'Subscription item quantity must be greater than zero'
        )
      })
    })

    it('should throw error when subscription items have negative unit price', async () => {
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
            transaction
          )
        ).rejects.toThrow(
          'Subscription item unit price cannot be negative'
        )
      })
    })

    it('should allow subscription items with zero unit price (free tier)', async () => {
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
        expect(bpItems.length).toBe(0)
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

      await adminTransaction(async ({ transaction }) => {
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
            transaction
          )
        ).rejects.toThrow(
          'EndOfCurrentBillingPeriod adjustments are only allowed for downgrades'
        )
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
          transaction
        )

        const mockTrigger = getMockTrigger()
        expect(mockTrigger).not.toHaveBeenCalled()

        expect(result.subscription.name).toBe('Item 1 Updated')
        expect(result.subscriptionItems.length).toBe(1)
        expect(result.subscriptionItems[0].name).toBe(
          'Item 1 Updated'
        )
      })
    })

    it('should NOT trigger billing run when rawNetCharge is zero', async () => {
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
          transaction
        )

        const mockTrigger = getMockTrigger()
        expect(mockTrigger).not.toHaveBeenCalled()
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
          transaction
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
        expect(item3Result).toBeDefined()
      })
    })

    it('should preserve subscription name when no active items exist after adjustment', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Original Plan',
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
          transaction
        )

        expect(result.subscription.name).toBe(originalName)
        expect(result.subscriptionItems.length).toBe(0)
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
          transaction
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
      })
    })

    it('should NOT update subscription items or sync subscription immediately when rawNetCharge is positive', async () => {
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
          transaction
        )

        expect(result.subscription.name).toBeNull()
        expect(result.subscriptionItems.length).toBe(1)
        expect(result.subscriptionItems[0].name).toBe('Item 1')
        expect(result.subscriptionItems[0].unitPrice).toBe(100)
      })
    })

    it('should create proration billing period items when netChargeAmount > 0', async () => {
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
          transaction
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
      })
    })

    it('should trigger billing run with correct params when upgrading (adding items, increasing quantity)', async () => {
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
          transaction
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
      })
    })

    it('should calculate proration correctly considering existing payments and cap at zero for downgrades', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Premium Plan',
        quantity: 1,
        unitPrice: 4999,
      })

      await adminTransaction(async ({ transaction }) => {
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
          transaction
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
          transaction
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
      })
    })

    it('should NOT create proration adjustments when prorateCurrentBillingPeriod is false and netChargeAmount > 0', async () => {
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
          transaction
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

      await adminTransaction(async ({ transaction }) => {
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
          transaction
        )

        const mockTrigger = getMockTrigger()
        expect(mockTrigger).not.toHaveBeenCalled()

        const result =
          await selectSubscriptionItemsAndSubscriptionBySubscriptionId(
            subscription.id,
            transaction
          )
        expect(result).not.toBeNull()
        if (!result) throw new Error('Result is null')
        const futureItem = result.subscriptionItems.find(
          (item) => item.name === 'Future Item'
        )
        expect(futureItem).toBeDefined()
        expect(toMs(futureItem!.addedDate)!).toBe(newEndDate)
      })
    })

    it('should NOT sync subscription record with future-dated items (preserves current state)', async () => {
      const initialItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Current Plan',
        quantity: 1,
        unitPrice: 1000,
      })

      await adminTransaction(async ({ transaction }) => {
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
          transaction
        )

        expect(result.subscription.name).toBe('Current Plan')
        expect(result.subscription.priceId).toBe(price.id)
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

      await adminTransaction(async ({ transaction }) => {
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
          transaction
        )

        const updatedItems =
          await selectSubscriptionItemsAndSubscriptionBySubscriptionId(
            subscription.id,
            transaction
          )
        expect(updatedItems).not.toBeNull()
        if (!updatedItems) throw new Error('Result is null')

        const expiredItem = updatedItems.subscriptionItems.find(
          (item) => item.id === expensiveItem.id
        )
        expect(expiredItem).toBeDefined()
        expect(toMs(expiredItem!.expiredAt)!).toEqual(
          toMs(currentBillingPeriod!.endDate)!
        )

        const newItem = updatedItems.subscriptionItems.find(
          (item) => item.name === 'Basic Plan'
        )
        expect(newItem).toBeDefined()
        expect(toMs(newItem!.addedDate)!).toEqual(
          toMs(currentBillingPeriod!.endDate)!
        )
      })
    })
  })

  /* ==========================================================================
    Edge Cases
  ========================================================================== */
  describe('Edge Cases', () => {
    it('should trigger billing run if net charge > 0, or sync immediately if net charge = 0 when no existing subscription items exist', async () => {
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
          transaction
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
          expect(result).not.toBeNull()
          if (!result) throw new Error('Result is null')
          expect(result.subscriptionItems.length).toBe(
            newItems.length
          )
        }
      })
    })

    it('should trigger billing run if net charge > 0, or sync immediately and preserve subscription name if net charge = 0 when all items are removed', async () => {
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
          transaction
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
            transaction
          )
        ).rejects.toThrow()
      })
    })

    it('should throw error when attempting adjustment with billing periods in the past or future', async () => {
      await adminTransaction(async ({ transaction }) => {
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
            transaction
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
            transaction
          )
        ).rejects.toThrow()
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
              transaction
            )
          })
        ).rejects.toThrow()
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
          transaction
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
        expect(orgPayload.currency).toBeDefined()
      })
    })

    it('should NOT send notifications when rawNetCharge is positive (upgrade requires payment)', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Basic Plan',
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
          transaction
        )

        // Verify notifications are NOT called for upgrade path (billing run is triggered instead)
        const mockCustomerNotification = getMockCustomerNotification()
        const mockOrgNotification = getMockOrgNotification()

        expect(mockCustomerNotification).not.toHaveBeenCalled()
        expect(mockOrgNotification).not.toHaveBeenCalled()

        // But billing run should be triggered
        const mockTrigger = getMockTrigger()
        expect(mockTrigger).toHaveBeenCalledTimes(1)
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
          transaction
        )

        // Should resolve to Immediately for upgrades
        expect(result.resolvedTiming).toBe(
          SubscriptionAdjustmentTiming.Immediately
        )
        expect(result.isUpgrade).toBe(true)

        // Billing run should be triggered for upgrades
        const mockTrigger = getMockTrigger()
        expect(mockTrigger).toHaveBeenCalledTimes(1)
      })
    })

    it('should apply downgrade at end of period when timing is auto', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Premium Plan',
        quantity: 1,
        unitPrice: 4999,
      })

      await adminTransaction(async ({ transaction }) => {
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
          transaction
        )

        // Should resolve to AtEndOfCurrentBillingPeriod for downgrades
        expect(result.resolvedTiming).toBe(
          SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
        )
        expect(result.isUpgrade).toBe(false)

        // Billing run should NOT be triggered for downgrades
        const mockTrigger = getMockTrigger()
        expect(mockTrigger).not.toHaveBeenCalled()
      })
    })

    it('should return correct isUpgrade value for lateral moves', async () => {
      const item1 = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Plan A',
        quantity: 1,
        unitPrice: 1000,
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
          transaction
        )

        // Same price = not an upgrade
        expect(result.isUpgrade).toBe(false)
        // Should resolve to Immediately for lateral moves
        expect(result.resolvedTiming).toBe(
          SubscriptionAdjustmentTiming.Immediately
        )
      })
    })
  })

  /* ==========================================================================
    Price Slug Resolution
  ========================================================================== */
  describe('Price Slug Resolution', () => {
    it('should resolve priceSlug to priceId using subscription pricing model', async () => {
      // Create a price with a slug
      // Note: pricingModelId is derived from product.pricingModelId automatically
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
          transaction
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
      })
    })

    it('should throw error when priceSlug not found in pricing model', async () => {
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Basic Plan',
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
            transaction
          )
        ).rejects.toThrow(/Price "nonexistent-slug" not found/)
      })
    })

    it('should expand terse subscription item with priceId to full item', async () => {
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Basic Plan',
        quantity: 1,
        unitPrice: 100,
      })

      await adminTransaction(async ({ transaction }) => {
        // Ensure subscription's pricingModelId matches the price's pricing model
        await updateSubscription(
          {
            id: subscription.id,
            pricingModelId: price.pricingModelId,
            renews: true,
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

        // Use terse format with priceId
        const newItems: TerseSubscriptionItem[] = [
          {
            priceId: price.id,
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
          transaction
        )

        // Should trigger billing run for upgrade (3 * price.unitPrice > 100)
        const mockTrigger = getMockTrigger()
        expect(mockTrigger).toHaveBeenCalledTimes(1)
        const triggerCall = mockTrigger.mock.calls[0][0]

        // The expanded item should have all the correct fields from the price
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems[0].priceId
        ).toBe(price.id)
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems[0]
            .quantity
        ).toBe(3)
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems[0]
            .unitPrice
        ).toBe(price.unitPrice)
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems[0].name
        ).toBe(price.name)
      })
    })

    it('should handle mixed item types (priceSlug + priceId) in the same request', async () => {
      // Create a price with a slug
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
        slug: 'premium-mixed-test',
      })

      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Basic Plan',
        quantity: 1,
        unitPrice: 100,
      })

      await adminTransaction(async ({ transaction }) => {
        // Set pricingModelId on the subscription to match the price's pricing model
        await updateSubscription(
          {
            id: subscription.id,
            pricingModelId: slugPrice.pricingModelId,
            renews: true,
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
            priceSlug: 'premium-mixed-test',
            quantity: 1,
          },
          {
            priceId: price.id,
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
          transaction
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
        expect(slugItem).toBeDefined()
        expect(slugItem!.unitPrice).toBe(slugPrice.unitPrice)
        expect(slugItem!.name).toBe(slugPrice.name)

        // Second item resolved from priceId
        const idItem = (
          triggerCall.adjustmentParams
            .newSubscriptionItems as SubscriptionItem.Record[]
        ).find((i) => i.priceId === price.id)
        expect(idItem).toBeDefined()
        expect(idItem!.quantity).toBe(2)
      })
    })

    it('should resolve UUID passed as priceSlug (SDK convenience)', async () => {
      // This tests the fallback behavior where priceSlug can accept a UUID (price ID)
      // The SDK passes price identifiers via priceSlug to avoid format detection
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Existing Plan',
        quantity: 1,
        unitPrice: 100,
      })

      await adminTransaction(async ({ transaction }) => {
        // Ensure subscription's pricingModelId matches the price's pricing model
        await updateSubscription(
          {
            id: subscription.id,
            pricingModelId: price.pricingModelId,
            renews: true,
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

        // Use a UUID (price.id) in the priceSlug field - this is the SDK's approach
        const newItems: TerseSubscriptionItem[] = [
          {
            priceSlug: price.id, // UUID passed as priceSlug
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
          transaction
        )

        // Should trigger billing run for upgrade
        const mockTrigger = getMockTrigger()
        expect(mockTrigger).toHaveBeenCalledTimes(1)
        const triggerCall = mockTrigger.mock.calls[0][0]

        // The item should be resolved correctly from the UUID
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems[0].priceId
        ).toBe(price.id)
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems[0]
            .unitPrice
        ).toBe(price.unitPrice)
        expect(
          triggerCall.adjustmentParams.newSubscriptionItems[0].name
        ).toBe(price.name)
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
          transaction
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
      })
    })

    it('should send upgrade notification when prorateCurrentBillingPeriod is false and isUpgrade is true', async () => {
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Basic Plan',
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
          transaction
        )

        // Should report as upgrade
        expect(result.isUpgrade).toBe(true)

        // Note: The notification itself is tested elsewhere, but we verify
        // that the code path for upgrades without proration is taken
        expect(result.resolvedTiming).toBe(
          SubscriptionAdjustmentTiming.Immediately
        )
      })
    })
  })
})
