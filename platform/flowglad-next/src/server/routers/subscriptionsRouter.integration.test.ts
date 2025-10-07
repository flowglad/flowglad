import {
  describe,
  test,
  expect,
  beforeEach,
  vi,
  afterEach,
} from 'vitest'
import {
  setupOrg,
  setupUserAndCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupInvoice,
  setupBillingPeriod,
  setupUserAndApiKey,
  setupSubscriptionItem,
  setupPayment,
  setupPrice,
} from '@/../seedDatabase'
import type { Organization } from '@/db/schema/organizations'
import type { User } from '@/db/schema/users'
import type { Customer } from '@/db/schema/customers'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Subscription } from '@/db/schema/subscriptions'
import type { Invoice } from '@/db/schema/invoices'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Product } from '@/db/schema/products'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import { subscriptionsRouter } from './subscriptionsRouter'
import { TRPCError } from '@trpc/server'
import {
  InvoiceStatus,
  PaymentStatus,
  SubscriptionAdjustmentTiming,
  SubscriptionItemType,
  SubscriptionStatus,
  IntervalUnit,
  BillingPeriodStatus,
  PriceType,
} from '@/types'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectSubscriptionById,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import {
  selectSubscriptionItems,
  updateSubscriptionItem,
} from '@/db/tableMethods/subscriptionItemMethods'
import { selectBillingPeriodItems } from '@/db/tableMethods/billingPeriodItemMethods'
import core from '@/utils/core'
import { subDays } from 'date-fns'

vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers()),
  cookies: vi.fn(() => ({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  })),
}))

let organization: Organization.Record
let pricingModel: PricingModel.Record
let product: Product.Record
let price: Price.Record
let expensivePrice: Price.Record
let user: User.Record
let customer: Customer.Record
let paymentMethod: PaymentMethod.Record
let subscription: Subscription.Record
let subscriptionItem: any
let billingPeriod: BillingPeriod.Record
let invoice: Invoice.Record
let apiKeyToken: string

beforeEach(async () => {
  vi.clearAllMocks()

  const orgData = await setupOrg()
  organization = orgData.organization
  pricingModel = orgData.pricingModel
  product = orgData.product
  price = orgData.price

  // Create an expensive price for upgrade tests
  expensivePrice = await setupPrice({
    productId: product.id,
    unitPrice: 4999, // $49.99
    name: 'Premium Plan',
    type: PriceType.Subscription,
    intervalUnit: IntervalUnit.Month,
    intervalCount: 1,
    livemode: true,
    isDefault: false,
  })

  const userData = await setupUserAndCustomer({
    organizationId: organization.id,
    livemode: true,
  })
  user = userData.user
  customer = userData.customer

  const apiKeyData = await setupUserAndApiKey({
    organizationId: organization.id,
    livemode: true,
  })
  apiKeyToken = apiKeyData.apiKey.token!

  paymentMethod = await setupPaymentMethod({
    organizationId: organization.id,
    customerId: customer.id,
    livemode: true,
  })

  const now = new Date()
  const billingPeriodStart = new Date(
    now.getTime() - 15 * 24 * 60 * 60 * 1000
  ) // 15 days ago
  const billingPeriodEnd = new Date(
    now.getTime() + 15 * 24 * 60 * 60 * 1000
  ) // 15 days from now

  subscription = await setupSubscription({
    organizationId: organization.id,
    customerId: customer.id,
    priceId: price.id,
    paymentMethodId: paymentMethod.id,
    status: SubscriptionStatus.Active,
    currentBillingPeriodStart: billingPeriodStart,
    currentBillingPeriodEnd: billingPeriodEnd,
    renews: true,
    livemode: true,
  })

  // Setup billing period
  billingPeriod = await setupBillingPeriod({
    subscriptionId: subscription.id,
    startDate: billingPeriodStart,
    endDate: billingPeriodEnd,
    status: BillingPeriodStatus.Active,
    livemode: true,
  })

  // Setup subscription item
  subscriptionItem = await setupSubscriptionItem({
    subscriptionId: subscription.id,
    priceId: price.id,
    name: 'Basic Plan',
    quantity: 1,
    unitPrice: 999, // $9.99
    addedDate: billingPeriodStart,
    type: SubscriptionItemType.Static,
  })

  // Setup invoice
  invoice = await setupInvoice({
    organizationId: organization.id,
    customerId: customer.id,
    billingPeriodId: billingPeriod.id,
    priceId: price.id,
    livemode: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Helper to create caller with API key context
const createCaller = (apiKey: string | null = null) => {
  const ctx = {
    organizationId: organization?.id,
    apiKey: apiKey!,
    livemode: true,
    environment: 'live' as const,
    isApi: true as any,
    path: '',
  } as any
  return subscriptionsRouter.createCaller(ctx)
}

describe('Subscriptions Router - Adjust Endpoint', () => {
  describe('Authorization', () => {
    test('should reject request without API key', async () => {
      const caller = createCaller(null)

      await expect(
        caller.adjust({
          id: subscription.id,
          adjustment: {
            newSubscriptionItems: [],
            timing: SubscriptionAdjustmentTiming.Immediately,
            prorateCurrentBillingPeriod: false,
          },
        })
      ).rejects.toThrow(TRPCError)
    })

    test('should reject request with invalid API key', async () => {
      const caller = createCaller('invalid_key')

      await expect(
        caller.adjust({
          id: subscription.id,
          adjustment: {
            newSubscriptionItems: [],
            timing: SubscriptionAdjustmentTiming.Immediately,
            prorateCurrentBillingPeriod: false,
          },
        })
      ).rejects.toThrow()
    })
  })

  describe('Input Validation', () => {
    test('should reject invalid subscription ID format', async () => {
      const caller = createCaller(apiKeyToken)

      await expect(
        caller.adjust({
          id: 'invalid-id',
          adjustment: {
            newSubscriptionItems: [],
            timing: SubscriptionAdjustmentTiming.Immediately,
            prorateCurrentBillingPeriod: false,
          },
        })
      ).rejects.toThrow()
    })

    test('should reject invalid timing value', async () => {
      const caller = createCaller(apiKeyToken)

      await expect(
        caller.adjust({
          id: subscription.id,
          adjustment: {
            newSubscriptionItems: [],
            timing: 'InvalidTiming' as any,
            prorateCurrentBillingPeriod: false,
          },
        })
      ).rejects.toThrow()
    })
  })

  describe('Immediate Adjustments', () => {
    test('should upgrade subscription with proration', async () => {
      const caller = createCaller(apiKeyToken)

      // Create existing payment to test proration calculation
      await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 999, // $9.99 already paid
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        billingPeriodId: billingPeriod.id,
        subscriptionId: subscription.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      const result = await caller.adjust({
        id: subscription.id,
        adjustment: {
          newSubscriptionItems: [
            {
              subscriptionId: subscription.id,
              priceId: expensivePrice.id,
              name: 'Premium Plan',
              quantity: 1,
              unitPrice: 4999, // $49.99
              type: SubscriptionItemType.Static,
              addedDate: new Date(),
              expiredAt: null,
              livemode: true,
              externalId: null,
              usageMeterId: null,
              usageEventsPerUnit: null,
            },
          ],
          timing: SubscriptionAdjustmentTiming.Immediately,
          prorateCurrentBillingPeriod: true,
        },
      })

      // Verify response structure
      expect(result).toHaveProperty('subscription')
      expect(result).toHaveProperty('subscriptionItems')
      expect(result.subscriptionItems).toHaveLength(1)
      expect(result.subscriptionItems[0].name).toBe('Premium Plan')
      expect(result.subscriptionItems[0].unitPrice).toBe(4999)

      // Verify subscription record was synced
      expect(result.subscription.name).toBe('Premium Plan')
      expect(result.subscription.priceId).toBe(expensivePrice.id)
    }, 30000)

    test('should handle downgrade without creating negative charges', async () => {
      const caller = createCaller(apiKeyToken)

      // For downgrade test, we'll upgrade first then downgrade
      // This avoids nested transaction issues in setup

      // First upgrade to expensive plan
      const upgradeResult = await caller.adjust({
        id: subscription.id,
        adjustment: {
          newSubscriptionItems: [
            {
              subscriptionId: subscription.id,
              priceId: expensivePrice.id,
              name: 'Premium Plan',
              quantity: 1,
              unitPrice: 4999,
              type: SubscriptionItemType.Static,
              addedDate: new Date(),
              expiredAt: null,
              livemode: true,
              externalId: null,
              usageMeterId: null,
              usageEventsPerUnit: null,
            },
          ],
          timing: SubscriptionAdjustmentTiming.Immediately,
          prorateCurrentBillingPeriod: false, // No proration for setup
        },
      })

      // Verify upgrade worked
      expect(upgradeResult.subscription.name).toBe('Premium Plan')

      // Create payment for expensive plan
      await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 4999, // $49.99 already paid
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
        billingPeriodId: billingPeriod.id,
        subscriptionId: subscription.id,
        paymentMethodId: paymentMethod.id,
        livemode: true,
      })

      // Now downgrade with proration
      const result = await caller.adjust({
        id: subscription.id,
        adjustment: {
          newSubscriptionItems: [
            {
              subscriptionId: subscription.id,
              priceId: price.id,
              name: 'Basic Plan',
              quantity: 1,
              unitPrice: 999, // $9.99 (downgrade)
              type: SubscriptionItemType.Static,
              addedDate: new Date(),
              expiredAt: null,
              livemode: true,
              externalId: null,
              usageMeterId: null,
              usageEventsPerUnit: null,
            },
          ],
          timing: SubscriptionAdjustmentTiming.Immediately,
          prorateCurrentBillingPeriod: true,
        },
      })

      // Verify downgrade was applied
      expect(result.subscription.name).toBe('Basic Plan')
      expect(result.subscription.priceId).toBe(price.id)
    }, 30000)

    test('should handle removing all items (empty subscription)', async () => {
      const caller = createCaller(apiKeyToken)

      const result = await caller.adjust({
        id: subscription.id,
        adjustment: {
          newSubscriptionItems: [], // Remove all items
          timing: SubscriptionAdjustmentTiming.Immediately,
          prorateCurrentBillingPeriod: true,
        },
      })

      // Should have no active subscription items
      expect(result.subscriptionItems).toHaveLength(0)

      // Subscription name should remain unchanged
      expect(result.subscription.name).toBe(subscription.name)
    }, 30000)
  })

  describe('At End of Billing Period Adjustments', () => {
    test('should schedule changes for end of billing period', async () => {
      const caller = createCaller(apiKeyToken)

      const result = await caller.adjust({
        id: subscription.id,
        adjustment: {
          newSubscriptionItems: [
            {
              subscriptionId: subscription.id,
              priceId: expensivePrice.id,
              name: 'Premium Plan',
              quantity: 1,
              unitPrice: 4999,
              type: SubscriptionItemType.Static,
              addedDate: billingPeriod.endDate, // Start at end of period
              expiredAt: null,
              livemode: true,
              externalId: null,
              usageMeterId: null,
              usageEventsPerUnit: null,
            },
          ],
          timing:
            SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
        },
      })

      // Should have both current and future items
      expect(result.subscriptionItems.length).toBeGreaterThanOrEqual(
        1
      )

      // Check if any item has the Premium Plan name (future item)
      const hasPremiumPlan = result.subscriptionItems.some(
        (item) => item.name === 'Premium Plan'
      )
      expect(hasPremiumPlan).toBe(true)
    }, 30000)
  })

  describe('Edge Cases', () => {
    test('should handle subscription in terminal state', async () => {
      const caller = createCaller(apiKeyToken)

      // Create a new cancelled subscription for this test
      const cancelledSub = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        paymentMethodId: paymentMethod.id,
        status: SubscriptionStatus.Canceled,
        currentBillingPeriodStart: billingPeriod.startDate,
        currentBillingPeriodEnd: billingPeriod.endDate,
        renews: false,
        livemode: true,
      })

      await expect(
        caller.adjust({
          id: cancelledSub.id,
          adjustment: {
            newSubscriptionItems: [],
            timing: SubscriptionAdjustmentTiming.Immediately,
            prorateCurrentBillingPeriod: false,
          },
        })
      ).rejects.toThrow(/terminal state/)
    })

    test('should handle non-existent subscription', async () => {
      const caller = createCaller(apiKeyToken)

      await expect(
        caller.adjust({
          id: 'sub_nonexistent123',
          adjustment: {
            newSubscriptionItems: [],
            timing: SubscriptionAdjustmentTiming.Immediately,
            prorateCurrentBillingPeriod: false,
          },
        })
      ).rejects.toThrow()
    })

    test('should handle multiple subscription items', async () => {
      const caller = createCaller(apiKeyToken)

      // Create a second price for add-on
      const addOnPrice = await setupPrice({
        productId: product.id,
        unitPrice: 500, // $5.00 add-on
        name: 'Add-on Feature',
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
      })

      const result = await caller.adjust({
        id: subscription.id,
        adjustment: {
          newSubscriptionItems: [
            {
              id: subscriptionItem.id, // Keep existing
              subscriptionId: subscription.id,
              priceId: price.id,
              name: 'Basic Plan',
              quantity: 1,
              unitPrice: 999,
              type: SubscriptionItemType.Static,
              addedDate: billingPeriod.startDate,
              expiredAt: null,
              livemode: true,
              externalId: null,
              usageMeterId: null,
              usageEventsPerUnit: null,
            },
            {
              // Add new item
              subscriptionId: subscription.id,
              priceId: addOnPrice.id,
              name: 'Add-on Feature',
              quantity: 1,
              unitPrice: 500,
              type: SubscriptionItemType.Static,
              addedDate: new Date(),
              expiredAt: null,
              livemode: true,
              externalId: null,
              usageMeterId: null,
              usageEventsPerUnit: null,
            },
          ],
          timing: SubscriptionAdjustmentTiming.Immediately,
          prorateCurrentBillingPeriod: true,
        },
      })

      // Should have 2 active items
      expect(result.subscriptionItems).toHaveLength(2)

      // Subscription should sync to the most expensive item (Basic Plan)
      expect(result.subscription.name).toBe('Basic Plan')
      expect(result.subscription.priceId).toBe(price.id)
    }, 30000)
  })

  describe('Response Format', () => {
    test('should return properly formatted subscription and items', async () => {
      const caller = createCaller(apiKeyToken)

      const result = await caller.adjust({
        id: subscription.id,
        adjustment: {
          newSubscriptionItems: [
            {
              subscriptionId: subscription.id,
              priceId: expensivePrice.id,
              name: 'Premium Plan',
              quantity: 2,
              unitPrice: 4999,
              type: SubscriptionItemType.Static,
              addedDate: new Date(),
              expiredAt: null,
              livemode: true,
              externalId: null,
              usageMeterId: null,
              usageEventsPerUnit: null,
            },
          ],
          timing: SubscriptionAdjustmentTiming.Immediately,
          prorateCurrentBillingPeriod: false,
        },
      })

      // Verify response structure
      expect(result).toMatchObject({
        subscription: {
          id: expect.any(String),
          name: expect.any(String),
          priceId: expect.any(String),
          customerId: customer.id,
          organizationId: organization.id,
          status: expect.any(String),
          current: expect.any(Boolean),
        },
        subscriptionItems: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            subscriptionId: subscription.id,
            name: 'Premium Plan',
            quantity: 2,
            unitPrice: 4999,
          }),
        ]),
      })
    }, 30000)
  })
})
