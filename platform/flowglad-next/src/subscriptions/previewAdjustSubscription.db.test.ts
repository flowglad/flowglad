import { beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import {
  BillingPeriodStatus,
  CurrencyCode,
  IntervalUnit,
  PriceType,
  SubscriptionStatus,
} from '@db-core/enums'
import type { BillingPeriod } from '@db-core/schema/billingPeriods'
import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { PaymentMethod } from '@db-core/schema/paymentMethods'
import type { Price } from '@db-core/schema/prices'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { Product } from '@db-core/schema/products'
import type { Subscription } from '@db-core/schema/subscriptions'
import { Result } from 'better-result'
import { addDays, subDays } from 'date-fns'
import {
  setupBillingPeriod,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupSubscription,
  setupSubscriptionItem,
} from '@/../seedDatabase'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import { updateSubscription } from '@/db/tableMethods/subscriptionMethods'
import { calculateAdjustmentPreview } from '@/subscriptions/adjustSubscription'
import { SubscriptionAdjustmentTiming } from '@/types'

describe('previewAdjustSubscription', () => {
  let organization: Organization.Record
  let price: Price.Record
  let product: Product.Record
  let pricingModel: PricingModel.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let billingPeriod: BillingPeriod.Record
  let subscription: Subscription.Record

  beforeAll(async () => {
    const result = await setupOrg()
    organization = result.organization
    price = result.price
    product = result.product
    pricingModel = result.pricingModel
  })

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
      status: SubscriptionStatus.Active,
      defaultPaymentMethodId: paymentMethod.id,
    })

    // Set up billing period to be halfway through
    const now = Date.now()
    const periodStart = subDays(now, 15).getTime()
    const periodEnd = addDays(now, 15).getTime()

    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      status: BillingPeriodStatus.Active,
      startDate: periodStart,
      endDate: periodEnd,
    })

    await setupSubscriptionItem({
      subscriptionId: subscription.id,
      priceId: price.id,
      name: 'Test Subscription Item',
      quantity: 1,
      unitPrice: price.unitPrice,
    })
  })

  describe('when subscription is in invalid state', () => {
    it('returns canAdjust: false for terminal state subscription', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          // Cancel the subscription to put it in terminal state
          await updateSubscription(
            {
              id: subscription.id,
              status: SubscriptionStatus.Canceled,
              renews: true,
            },
            transaction
          )

          const result = await calculateAdjustmentPreview(
            {
              id: subscription.id,
              adjustment: {
                timing: SubscriptionAdjustmentTiming.Immediately,
                newSubscriptionItems: [
                  {
                    priceId: price.id,
                    quantity: 2,
                  },
                ],
              },
            } as any,
            transaction
          )

          expect(result.canAdjust).toBe(false)
          if (!result.canAdjust) {
            expect(result.reason).toContain('terminal state')
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('returns canAdjust: false for non-renewing subscription', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updateSubscription(
            {
              id: subscription.id,
              renews: false,
            },
            transaction
          )

          const result = await calculateAdjustmentPreview(
            {
              id: subscription.id,
              adjustment: {
                timing: SubscriptionAdjustmentTiming.Immediately,
                newSubscriptionItems: [
                  {
                    priceId: price.id,
                    quantity: 2,
                  },
                ],
              },
            } as any,
            transaction
          )

          expect(result.canAdjust).toBe(false)
          if (!result.canAdjust) {
            expect(result.reason).toContain('Non-renewing')
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('returns canAdjust: false for doNotCharge subscription', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updateSubscription(
            {
              id: subscription.id,
              doNotCharge: true,
              renews: true,
            },
            transaction
          )

          const result = await calculateAdjustmentPreview(
            {
              id: subscription.id,
              adjustment: {
                timing: SubscriptionAdjustmentTiming.Immediately,
                newSubscriptionItems: [
                  {
                    priceId: price.id,
                    quantity: 2,
                  },
                ],
              },
            } as any,
            transaction
          )

          expect(result.canAdjust).toBe(false)
          if (!result.canAdjust) {
            expect(result.reason).toContain('doNotCharge')
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('returns canAdjust: false for free plan subscription', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updateSubscription(
            {
              id: subscription.id,
              isFreePlan: true,
              renews: true,
            },
            transaction
          )

          const result = await calculateAdjustmentPreview(
            {
              id: subscription.id,
              adjustment: {
                timing: SubscriptionAdjustmentTiming.Immediately,
                newSubscriptionItems: [
                  {
                    priceId: price.id,
                    quantity: 2,
                  },
                ],
              },
            } as any,
            transaction
          )

          expect(result.canAdjust).toBe(false)
          if (!result.canAdjust) {
            expect(result.reason).toContain('free plan')
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  describe('when adjustment is valid', () => {
    it('returns upgrade preview with proration for immediate upgrade', async () => {
      // Create a higher-priced plan
      const higherPrice = await setupPrice({
        name: 'Premium Plan',
        unitPrice: price.unitPrice * 2, // Double the price
        productId: product.id,
        livemode: false,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        currency: CurrencyCode.USD,
        type: PriceType.Subscription,
        isDefault: false,
      })

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const result = await calculateAdjustmentPreview(
            {
              id: subscription.id,
              adjustment: {
                timing: SubscriptionAdjustmentTiming.Immediately,
                newSubscriptionItems: [
                  {
                    priceId: higherPrice.id,
                    quantity: 1,
                  },
                ],
              },
            } as any,
            transaction
          )

          expect(result.canAdjust).toBe(true)
          if (result.canAdjust) {
            expect(result.isUpgrade).toBe(true)
            expect(result.prorationAmount).toBeGreaterThan(0)
            expect(result.resolvedTiming).toBe(
              SubscriptionAdjustmentTiming.Immediately
            )
            expect(result.paymentMethodId).toBe(paymentMethod.id)
            expect(result.currentSubscriptionItems.length).toBe(1)
            expect(result.resolvedNewSubscriptionItems.length).toBe(1)
            expect(result.currentPlanTotal).toBe(price.unitPrice)
            expect(result.newPlanTotal).toBe(higherPrice.unitPrice)
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('returns downgrade preview with zero proration for end-of-period', async () => {
      // Create a lower-priced plan
      const lowerPrice = await setupPrice({
        name: 'Basic Plan',
        unitPrice: Math.floor(price.unitPrice / 2), // Half the price
        productId: product.id,
        livemode: false,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        currency: CurrencyCode.USD,
        type: PriceType.Subscription,
        isDefault: false,
      })

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const result = await calculateAdjustmentPreview(
            {
              id: subscription.id,
              adjustment: {
                timing:
                  SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
                newSubscriptionItems: [
                  {
                    priceId: lowerPrice.id,
                    quantity: 1,
                  },
                ],
              },
            } as any,
            transaction
          )

          expect(result.canAdjust).toBe(true)
          if (result.canAdjust) {
            expect(result.isUpgrade).toBe(false)
            expect(result.prorationAmount).toBe(0) // End-of-period means no proration
            expect(result.resolvedTiming).toBe(
              SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
            )
            expect(result.effectiveDate).toBe(billingPeriod.endDate)
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('resolves auto timing to Immediately for upgrades', async () => {
      // Create a higher-priced plan
      const higherPrice = await setupPrice({
        name: 'Premium Plan',
        unitPrice: price.unitPrice * 2,
        productId: product.id,
        livemode: false,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        currency: CurrencyCode.USD,
        type: PriceType.Subscription,
        isDefault: false,
      })

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const result = await calculateAdjustmentPreview(
            {
              id: subscription.id,
              adjustment: {
                timing: SubscriptionAdjustmentTiming.Auto,
                newSubscriptionItems: [
                  {
                    priceId: higherPrice.id,
                    quantity: 1,
                  },
                ],
              },
            } as any,
            transaction
          )

          expect(result.canAdjust).toBe(true)
          if (result.canAdjust) {
            expect(result.resolvedTiming).toBe(
              SubscriptionAdjustmentTiming.Immediately
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('resolves auto timing to AtEndOfCurrentBillingPeriod for downgrades', async () => {
      // Create a lower-priced plan
      const lowerPrice = await setupPrice({
        name: 'Basic Plan',
        unitPrice: Math.floor(price.unitPrice / 2),
        productId: product.id,
        livemode: false,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        currency: CurrencyCode.USD,
        type: PriceType.Subscription,
        isDefault: false,
      })

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const result = await calculateAdjustmentPreview(
            {
              id: subscription.id,
              adjustment: {
                timing: SubscriptionAdjustmentTiming.Auto,
                newSubscriptionItems: [
                  {
                    priceId: lowerPrice.id,
                    quantity: 1,
                  },
                ],
              },
            } as any,
            transaction
          )

          expect(result.canAdjust).toBe(true)
          if (result.canAdjust) {
            expect(result.resolvedTiming).toBe(
              SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
            )
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('resolves priceSlug to priceId in newSubscriptionItems', async () => {
      // Create a price with a slug
      const sluggedPrice = await setupPrice({
        name: 'Slugged Plan',
        slug: 'slugged-plan-test',
        unitPrice: price.unitPrice * 2,
        productId: product.id,
        livemode: false,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        currency: CurrencyCode.USD,
        type: PriceType.Subscription,
        isDefault: false,
      })

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const result = await calculateAdjustmentPreview(
            {
              id: subscription.id,
              adjustment: {
                timing: SubscriptionAdjustmentTiming.Immediately,
                newSubscriptionItems: [
                  {
                    priceSlug: 'slugged-plan-test',
                    quantity: 1,
                  },
                ],
              },
            } as any,
            transaction
          )

          expect(result.canAdjust).toBe(true)
          if (result.canAdjust) {
            expect(result.resolvedNewSubscriptionItems.length).toBe(1)
            expect(
              result.resolvedNewSubscriptionItems[0].priceId
            ).toBe(sluggedPrice.id)
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  describe('when payment method is missing', () => {
    it('returns canAdjust: false for immediate upgrade without payment method', async () => {
      // Create a higher-priced plan
      const higherPrice = await setupPrice({
        name: 'Premium Plan',
        unitPrice: price.unitPrice * 2,
        productId: product.id,
        livemode: false,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        currency: CurrencyCode.USD,
        type: PriceType.Subscription,
        isDefault: false,
      })

      // Remove payment method from subscription and test
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updateSubscription(
            {
              id: subscription.id,
              defaultPaymentMethodId: null,
              backupPaymentMethodId: null,
              renews: true,
            },
            transaction
          )

          const result = await calculateAdjustmentPreview(
            {
              id: subscription.id,
              adjustment: {
                timing: SubscriptionAdjustmentTiming.Immediately,
                newSubscriptionItems: [
                  {
                    priceId: higherPrice.id,
                    quantity: 1,
                  },
                ],
              },
            } as any,
            transaction
          )

          expect(result.canAdjust).toBe(false)
          if (!result.canAdjust) {
            expect(result.reason).toContain('payment method')
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('returns canAdjust: true for end-of-period downgrade without payment method', async () => {
      // Create a lower-priced plan
      const lowerPrice = await setupPrice({
        name: 'Basic Plan',
        unitPrice: Math.floor(price.unitPrice / 2),
        productId: product.id,
        livemode: false,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        currency: CurrencyCode.USD,
        type: PriceType.Subscription,
        isDefault: false,
      })

      // Remove payment method from subscription and test
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updateSubscription(
            {
              id: subscription.id,
              defaultPaymentMethodId: null,
              backupPaymentMethodId: null,
              renews: true,
            },
            transaction
          )

          const result = await calculateAdjustmentPreview(
            {
              id: subscription.id,
              adjustment: {
                timing:
                  SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
                newSubscriptionItems: [
                  {
                    priceId: lowerPrice.id,
                    quantity: 1,
                  },
                ],
              },
            } as any,
            transaction
          )

          // End-of-period downgrade doesn't require payment method since no immediate charge
          expect(result.canAdjust).toBe(true)
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  // Note: Resource capacity validation tests are covered in adjustSubscription.db.test.ts
  // since calculateAdjustmentPreview shares the same validation logic

  describe('when pending changes exist', () => {
    it('returns canAdjust: false when a scheduled adjustment already exists', async () => {
      const futureTimestamp = Date.now() + 86400000 // 1 day from now

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updateSubscription(
            {
              id: subscription.id,
              scheduledAdjustmentAt: futureTimestamp,
              renews: true,
            },
            transaction
          )

          const result = await calculateAdjustmentPreview(
            {
              id: subscription.id,
              adjustment: {
                timing: SubscriptionAdjustmentTiming.Immediately,
                newSubscriptionItems: [
                  {
                    priceId: price.id,
                    quantity: 2,
                  },
                ],
              },
            } as any,
            transaction
          )

          expect(result.canAdjust).toBe(false)
          if (!result.canAdjust) {
            expect(result.reason).toContain('scheduled adjustment')
            expect(result.reason).toContain('already pending')
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('returns canAdjust: false when a cancellation is scheduled', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updateSubscription(
            {
              id: subscription.id,
              status: SubscriptionStatus.CancellationScheduled,
              cancelScheduledAt: billingPeriod.endDate,
              renews: true,
            },
            transaction
          )

          const result = await calculateAdjustmentPreview(
            {
              id: subscription.id,
              adjustment: {
                timing: SubscriptionAdjustmentTiming.Immediately,
                newSubscriptionItems: [
                  {
                    priceId: price.id,
                    quantity: 2,
                  },
                ],
              },
            } as any,
            transaction
          )

          expect(result.canAdjust).toBe(false)
          if (!result.canAdjust) {
            expect(result.reason).toContain(
              'cancellation is scheduled'
            )
            expect(result.reason).toContain('Uncancel')
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })
})
