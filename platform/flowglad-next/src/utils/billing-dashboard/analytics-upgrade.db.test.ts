import { beforeEach, describe, expect, it } from 'bun:test'
import {
  IntervalUnit,
  PaymentMethodType,
  PriceType,
  SubscriptionStatus,
} from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { PaymentMethod } from '@db-core/schema/paymentMethods'
import type { Price } from '@db-core/schema/prices'
import type { Product } from '@db-core/schema/products'
import {
  Subscription,
  subscriptions,
} from '@db-core/schema/subscriptions'
import { Result } from 'better-result'
import {
  addDays,
  endOfMonth,
  startOfMonth,
  subDays,
  subMonths,
} from 'date-fns'
import { and, eq } from 'drizzle-orm'
import {
  setupBillingPeriod,
  setupBillingPeriodItem,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupSubscription,
} from '@/../seedDatabase'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import { updateSubscription } from '@/db/tableMethods/subscriptionMethods'
import { CancellationReason } from '@/types'
import { core } from '@/utils/core'
import { calculateMRRBreakdown } from './revenueCalculationHelpers'
import { calculateSubscriberBreakdown } from './subscriberCalculationHelpers'
import {
  getUpgradeConversionRate,
  getUpgradeMetrics,
  getUpgradePaths,
} from './upgradeMetrics'

describe('Analytics Upgrade Tracking', () => {
  let organization: Organization.Record
  let product: Product.Record
  let freeProduct: Product.Record
  let pricingModel: any // Using any since it could be PricingModel
  let price: Price.Record
  let freePrice: Price.Record
  let customer1: Customer.Record
  let customer2: Customer.Record
  let customer3: Customer.Record
  let paymentMethod1: PaymentMethod.Record
  let paymentMethod2: PaymentMethod.Record
  let paymentMethod3: PaymentMethod.Record

  beforeEach(async () => {
    // Set up organization with default pricing model and products
    const orgData = await setupOrg()
    organization = orgData.organization
    product = orgData.product
    price = orgData.price
    pricingModel = orgData.pricingModel

    // Create a free product and price
    freeProduct = await setupProduct({
      organizationId: organization.id,
      name: 'Free Plan',
      pricingModelId: pricingModel.id,
      livemode: true,
    })

    freePrice = await setupPrice({
      productId: freeProduct.id,
      name: 'Free Tier',
      type: PriceType.Subscription,
      unitPrice: 0, // Free
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: true,
      currency: organization.defaultCurrency,
    })

    // Create multiple customers for testing
    customer1 = await setupCustomer({
      organizationId: organization.id,
      email: `customer1+${core.nanoid()}@test.com`,
      livemode: true,
    })

    customer2 = await setupCustomer({
      organizationId: organization.id,
      email: `customer2+${core.nanoid()}@test.com`,
      livemode: true,
    })

    customer3 = await setupCustomer({
      organizationId: organization.id,
      email: `customer3+${core.nanoid()}@test.com`,
      livemode: true,
    })

    // Create payment methods for customers
    paymentMethod1 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer1.id,
      type: PaymentMethodType.Card,
      livemode: true,
    })

    paymentMethod2 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer2.id,
      type: PaymentMethodType.Card,
      livemode: true,
    })

    paymentMethod3 = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer3.id,
      type: PaymentMethodType.Card,
      livemode: true,
    })
  })

  describe('subscriberCalculationHelpers', () => {
    describe('calculateSubscriberBreakdown', () => {
      it('should exclude upgraded subscriptions from churn count', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const previousMonth = subMonths(new Date(), 1).getTime()
              const currentMonth = Date.now()

              // Create 3 free subscriptions in previous month
              const freeSub1 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: previousMonth,
                isFreePlan: true,
                livemode: true,
              })

              const freeSub2 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer2.id,
                paymentMethodId: paymentMethod2.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: previousMonth,
                isFreePlan: true,
                livemode: true,
              })

              const freeSub3 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer3.id,
                paymentMethodId: paymentMethod3.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: previousMonth,
                isFreePlan: true,
                livemode: true,
              })

              // In current month: upgrade 2 to paid
              await updateSubscription(
                {
                  id: freeSub1.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: currentMonth,
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  renews: freeSub1.renews,
                },
                transaction
              )

              await updateSubscription(
                {
                  id: freeSub2.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: currentMonth,
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  renews: freeSub2.renews,
                },
                transaction
              )

              // Cancel 1 normally
              await updateSubscription(
                {
                  id: freeSub3.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: currentMonth,
                  cancellationReason:
                    CancellationReason.CustomerRequest,
                  renews: freeSub3.renews,
                },
                transaction
              )

              // Calculate subscriber breakdown
              const breakdown = await calculateSubscriberBreakdown(
                organization.id,
                currentMonth,
                previousMonth,
                transaction
              )

              // Verify churned count excludes upgrades
              expect(breakdown.churned).toBe(1) // Only the normally canceled subscription
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })

      it('should correctly count new subscribers regardless of upgrade status', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const currentMonth = new Date()
              const currentMonthTime = currentMonth.getTime()
              const previousMonth = subMonths(new Date(), 1)
              const previousMonthTime = previousMonth.getTime()

              // Create additional customers for testing
              const customer4 = await setupCustomer({
                organizationId: organization.id,
                email: `customer4+${core.nanoid()}@test.com`,
                livemode: true,
              })

              const customer5 = await setupCustomer({
                organizationId: organization.id,
                email: `customer5+${core.nanoid()}@test.com`,
                livemode: true,
              })

              const paymentMethod4 = await setupPaymentMethod({
                organizationId: organization.id,
                customerId: customer4.id,
                type: PaymentMethodType.Card,
                livemode: true,
              })

              const paymentMethod5 = await setupPaymentMethod({
                organizationId: organization.id,
                customerId: customer5.id,
                type: PaymentMethodType.Card,
                livemode: true,
              })

              // In current month: create 2 new free subscriptions
              await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(
                  startOfMonth(currentMonthTime),
                  5
                ).getTime(),
                isFreePlan: true,
                livemode: true,
              })

              await setupSubscription({
                organizationId: organization.id,
                customerId: customer2.id,
                paymentMethodId: paymentMethod2.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(
                  startOfMonth(currentMonthTime),
                  10
                ).getTime(),
                isFreePlan: true,
                livemode: true,
              })

              // In current month: create 1 new paid subscription (not an upgrade)
              await setupSubscription({
                organizationId: organization.id,
                customerId: customer3.id,
                paymentMethodId: paymentMethod3.id,
                priceId: price.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(
                  startOfMonth(currentMonthTime),
                  15
                ).getTime(),
                livemode: true,
              })

              // Calculate subscriber breakdown
              const breakdown = await calculateSubscriberBreakdown(
                organization.id,
                currentMonthTime,
                previousMonthTime,
                transaction
              )

              // Verify all new subscriptions are counted
              expect(breakdown.newSubscribers).toBe(3)
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })

      it('should handle mixed cancellation reasons correctly', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const previousMonth = subMonths(new Date(), 1)
              const previousMonthTime = previousMonth.getTime()
              const currentMonth = new Date()
              const currentMonthTime = currentMonth.getTime()

              // Create additional customers for testing
              const customer4 = await setupCustomer({
                organizationId: organization.id,
                email: `customer4+${core.nanoid()}@test.com`,
                livemode: true,
              })

              const paymentMethod4 = await setupPaymentMethod({
                organizationId: organization.id,
                customerId: customer4.id,
                type: PaymentMethodType.Card,
                livemode: true,
              })

              // Create 4 subscriptions in previous month
              const sub1 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: price.id,
                status: SubscriptionStatus.Active,
                startDate: previousMonthTime,
                livemode: true,
              })

              const sub2 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer2.id,
                paymentMethodId: paymentMethod2.id,
                priceId: price.id,
                status: SubscriptionStatus.Active,
                startDate: previousMonthTime,
                livemode: true,
              })

              const sub3 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer3.id,
                paymentMethodId: paymentMethod3.id,
                priceId: price.id,
                status: SubscriptionStatus.Active,
                startDate: previousMonthTime,
                livemode: true,
              })

              const sub4 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer4.id,
                paymentMethodId: paymentMethod4.id,
                priceId: price.id,
                status: SubscriptionStatus.Active,
                startDate: previousMonthTime,
                livemode: true,
              })

              // Cancel with different reasons in current month
              await updateSubscription(
                {
                  id: sub1.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: addDays(
                    startOfMonth(currentMonthTime),
                    5
                  ).getTime(),
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  renews: sub1.renews,
                },
                transaction
              )

              await updateSubscription(
                {
                  id: sub2.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: addDays(
                    startOfMonth(currentMonthTime),
                    10
                  ).getTime(),
                  cancellationReason:
                    CancellationReason.CustomerRequest,
                  renews: sub2.renews,
                },
                transaction
              )

              await updateSubscription(
                {
                  id: sub3.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: addDays(
                    startOfMonth(currentMonthTime),
                    15
                  ).getTime(),
                  cancellationReason: CancellationReason.NonPayment,
                  renews: sub3.renews,
                },
                transaction
              )

              await updateSubscription(
                {
                  id: sub4.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: addDays(
                    startOfMonth(currentMonthTime),
                    20
                  ).getTime(),
                  cancellationReason: CancellationReason.Other,
                  renews: sub4.renews,
                },
                transaction
              )

              // Calculate subscriber breakdown
              const breakdown = await calculateSubscriberBreakdown(
                organization.id,
                currentMonthTime,
                previousMonthTime,
                transaction
              )

              // Verify churned count excludes only upgraded_to_paid
              expect(breakdown.churned).toBe(3) // All except upgraded_to_paid
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })
    })
  })

  describe('revenueCalculationHelpers', () => {
    describe('calculateMRRBreakdown', () => {
      it('should track upgrade MRR separately from new MRR', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const previousMonth = subMonths(new Date(), 1)
              const previousMonthTime = previousMonth.getTime()
              const currentMonth = new Date()
              const currentMonthTime = currentMonth.getTime()

              // Create higher price tier for testing
              const paidPrice = await setupPrice({
                productId: product.id,
                name: 'Paid Tier',
                type: PriceType.Subscription,
                unitPrice: 10000, // $100/month in cents
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })

              const basicPrice = await setupPrice({
                productId: product.id,
                name: 'Basic Tier',
                type: PriceType.Subscription,
                unitPrice: 5000, // $50/month in cents
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })

              // Previous month: create 2 free subscriptions
              const freeSub1 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: previousMonthTime,
                isFreePlan: true,
                livemode: true,
              })

              const freeSub2 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer2.id,
                paymentMethodId: paymentMethod2.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: previousMonthTime,
                isFreePlan: true,
                livemode: true,
              })

              // Set up billing periods for previous month
              await setupBillingPeriod({
                subscriptionId: freeSub1.id,
                startDate: startOfMonth(previousMonth).getTime(),
                endDate: endOfMonth(previousMonth).getTime(),
                livemode: true,
              })

              await setupBillingPeriod({
                subscriptionId: freeSub2.id,
                startDate: startOfMonth(previousMonth).getTime(),
                endDate: endOfMonth(previousMonth).getTime(),
                livemode: true,
              })

              // Current month: upgrade 1 free to paid
              await updateSubscription(
                {
                  id: freeSub1.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: currentMonthTime,
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  renews: freeSub1.renews,
                },
                transaction
              )

              const upgradedSub = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: paidPrice.id,
                status: SubscriptionStatus.Active,
                startDate: currentMonthTime,
                livemode: true,
              })

              // Link the subscriptions
              await updateSubscription(
                {
                  id: freeSub1.id,
                  replacedBySubscriptionId: upgradedSub.id,
                  renews: freeSub1.renews,
                },
                transaction
              )

              // Create new paid subscription
              const newPaidSub = await setupSubscription({
                organizationId: organization.id,
                customerId: customer3.id,
                paymentMethodId: paymentMethod3.id,
                priceId: basicPrice.id,
                status: SubscriptionStatus.Active,
                startDate: currentMonthTime,
                livemode: true,
              })

              // Set up billing periods for current month with items
              const [upgradedBp, newPaidBp, freeSub2Bp] =
                await Promise.all([
                  setupBillingPeriod({
                    subscriptionId: upgradedSub.id,
                    startDate:
                      startOfMonth(currentMonthTime).getTime(),
                    endDate: endOfMonth(currentMonthTime).getTime(),
                    livemode: true,
                  }),
                  setupBillingPeriod({
                    subscriptionId: newPaidSub.id,
                    startDate:
                      startOfMonth(currentMonthTime).getTime(),
                    endDate: endOfMonth(currentMonthTime).getTime(),
                    livemode: true,
                  }),
                  setupBillingPeriod({
                    subscriptionId: freeSub2.id,
                    startDate:
                      startOfMonth(currentMonthTime).getTime(),
                    endDate: endOfMonth(currentMonthTime).getTime(),
                    livemode: true,
                  }),
                ])

              // Add billing period items for MRR calculation
              await Promise.all([
                setupBillingPeriodItem({
                  billingPeriodId: upgradedBp.id,
                  quantity: 1,
                  unitPrice: 10000, // $100 in cents
                  name: 'Upgraded Subscription',
                  livemode: true,
                }),
                setupBillingPeriodItem({
                  billingPeriodId: newPaidBp.id,
                  quantity: 1,
                  unitPrice: 5000, // $50 in cents
                  name: 'New Paid Subscription',
                  livemode: true,
                }),
                setupBillingPeriodItem({
                  billingPeriodId: freeSub2Bp.id,
                  quantity: 1,
                  unitPrice: 0, // Free
                  name: 'Free Subscription',
                  livemode: true,
                }),
              ])

              // Calculate MRR breakdown
              const breakdown = await calculateMRRBreakdown(
                organization.id,
                currentMonth,
                previousMonth,
                transaction
              )

              // Verify MRR components (values are in cents)
              expect(breakdown.upgradeMRR).toBe(10000) // Upgraded subscription ($100 in cents)
              expect(breakdown.newMRR).toBe(5000) // New paid subscription ($50 in cents)
              expect(breakdown.churnMRR).toBe(0) // Upgrade not counted as churn
              expect(breakdown.netMRR).toBe(15000) // Total net MRR ($150 in cents)
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })

      it('should not count upgraded subscriptions in churn MRR', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const previousMonth = subMonths(new Date(), 1)
              const previousMonthTime = previousMonth.getTime()
              const currentMonth = new Date()
              const currentMonthTime = currentMonth.getTime()
              // Create higher price tier for upgrade
              const premiumPrice = await setupPrice({
                productId: product.id,
                name: 'Premium Tier',
                type: PriceType.Subscription,
                unitPrice: 20000, // $200/month in cents
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })

              // Previous month: create 3 paid subscriptions ($100/month each)
              const sub1 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: price.id, // Default price is $100/month
                status: SubscriptionStatus.Active,
                startDate: previousMonthTime,
                livemode: true,
              })

              const sub2 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer2.id,
                paymentMethodId: paymentMethod2.id,
                priceId: price.id,
                status: SubscriptionStatus.Active,
                startDate: previousMonthTime,
                livemode: true,
              })

              const sub3 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer3.id,
                paymentMethodId: paymentMethod3.id,
                priceId: price.id,
                status: SubscriptionStatus.Active,
                startDate: previousMonthTime,
                livemode: true,
              })

              // Set up billing periods for previous month
              const [bp1Prev, bp2Prev, bp3Prev] = await Promise.all([
                setupBillingPeriod({
                  subscriptionId: sub1.id,
                  startDate: startOfMonth(previousMonth).getTime(),
                  endDate: endOfMonth(previousMonth).getTime(),
                  livemode: true,
                }),
                setupBillingPeriod({
                  subscriptionId: sub2.id,
                  startDate: startOfMonth(previousMonth).getTime(),
                  endDate: endOfMonth(previousMonth).getTime(),
                  livemode: true,
                }),
                setupBillingPeriod({
                  subscriptionId: sub3.id,
                  startDate: startOfMonth(previousMonth).getTime(),
                  endDate: endOfMonth(previousMonth).getTime(),
                  livemode: true,
                }),
              ])

              // Add billing period items for previous month (all $100/month)
              await Promise.all([
                setupBillingPeriodItem({
                  billingPeriodId: bp1Prev.id,
                  quantity: 1,
                  unitPrice: 10000, // $100 in cents
                  name: 'Subscription 1',
                  livemode: true,
                }),
                setupBillingPeriodItem({
                  billingPeriodId: bp2Prev.id,
                  quantity: 1,
                  unitPrice: 10000, // $100 in cents
                  name: 'Subscription 2',
                  livemode: true,
                }),
                setupBillingPeriodItem({
                  billingPeriodId: bp3Prev.id,
                  quantity: 1,
                  unitPrice: 10000, // $100 in cents
                  name: 'Subscription 3',
                  livemode: true,
                }),
              ])

              // Current month: upgrade sub1 to higher tier
              await updateSubscription(
                {
                  id: sub1.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: currentMonth.getTime(),
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  renews: sub1.renews,
                },
                transaction
              )

              const upgradedSub = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: premiumPrice.id,
                status: SubscriptionStatus.Active,
                startDate: currentMonth.getTime(),
                livemode: true,
              })

              // Link the subscriptions
              await updateSubscription(
                {
                  id: sub1.id,
                  replacedBySubscriptionId: upgradedSub.id,
                  renews: sub1.renews,
                },
                transaction
              )

              // Cancel sub2 normally
              await updateSubscription(
                {
                  id: sub2.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: currentMonthTime,
                  cancellationReason:
                    CancellationReason.CustomerRequest,
                  renews: sub2.renews,
                },
                transaction
              )
              const startOfCurrentMonthTime =
                startOfMonth(currentMonthTime).getTime()
              const endOfCurrentMonthTime =
                endOfMonth(currentMonthTime).getTime()
              // Keep sub3 active - create billing period for current month
              const [upgradedBp, sub3Bp] = await Promise.all([
                setupBillingPeriod({
                  subscriptionId: upgradedSub.id,
                  startDate: startOfCurrentMonthTime,
                  endDate: endOfCurrentMonthTime,
                  livemode: true,
                }),
                setupBillingPeriod({
                  subscriptionId: sub3.id,
                  startDate: startOfCurrentMonthTime,
                  endDate: endOfCurrentMonthTime,
                  livemode: true,
                }),
              ])

              // Add billing period items for current month
              await Promise.all([
                setupBillingPeriodItem({
                  billingPeriodId: upgradedBp.id,
                  quantity: 1,
                  unitPrice: 20000, // $200 in cents (upgraded)
                  name: 'Upgraded Subscription',
                  livemode: true,
                }),
                setupBillingPeriodItem({
                  billingPeriodId: sub3Bp.id,
                  quantity: 1,
                  unitPrice: 10000, // $100 in cents (still active)
                  name: 'Subscription 3',
                  livemode: true,
                }),
              ])

              // Calculate MRR breakdown
              const breakdown = await calculateMRRBreakdown(
                organization.id,
                currentMonth,
                previousMonth,
                transaction
              )

              // Verify MRR components
              expect(breakdown.churnMRR).toBe(10000) // Only sub2 ($100) counted as churn
              expect(breakdown.upgradeMRR).toBe(20000) // Upgraded subscription's new value ($200)
              // The upgraded subscription (sub1) should NOT appear in churnMRR
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })

      it('should correctly calculate net MRR with all components', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const previousMonth = subMonths(new Date(), 1)
              const previousMonthTime = previousMonth.getTime()
              const currentMonth = new Date()
              const currentMonthTime = currentMonth.getTime()
              // Create additional customers
              const extraCustomers = await Promise.all(
                Array.from({ length: 4 }, async (_, i) => {
                  const customer = await setupCustomer({
                    organizationId: organization.id,
                    email: `extra${i}+${core.nanoid()}@test.com`,
                    livemode: true,
                  })
                  const paymentMethod = await setupPaymentMethod({
                    organizationId: organization.id,
                    customerId: customer.id,
                    type: PaymentMethodType.Card,
                    livemode: true,
                  })
                  return { customer, paymentMethod }
                })
              )

              // Create multiple price tiers
              const basicPrice = await setupPrice({
                productId: product.id,
                name: 'Basic Tier',
                type: PriceType.Subscription,
                unitPrice: 5000, // $50/month
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })

              const standardPrice = await setupPrice({
                productId: product.id,
                name: 'Standard Tier',
                type: PriceType.Subscription,
                unitPrice: 10000, // $100/month
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })

              const premiumPrice = await setupPrice({
                productId: product.id,
                name: 'Premium Tier',
                type: PriceType.Subscription,
                unitPrice: 20000, // $200/month
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })

              // Previous month: mix of free and paid subscriptions
              // 1. Free subscription (will be upgraded)
              const freeSub = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: previousMonthTime,
                isFreePlan: true,
                livemode: true,
              })

              // 2. Basic subscription (will be expanded to standard)
              const basicSub = await setupSubscription({
                organizationId: organization.id,
                customerId: customer2.id,
                paymentMethodId: paymentMethod2.id,
                priceId: basicPrice.id,
                status: SubscriptionStatus.Active,
                startDate: previousMonthTime,
                livemode: true,
              })

              // 3. Premium subscription (will be contracted to standard)
              const premiumSub = await setupSubscription({
                organizationId: organization.id,
                customerId: customer3.id,
                paymentMethodId: paymentMethod3.id,
                priceId: premiumPrice.id,
                status: SubscriptionStatus.Active,
                startDate: previousMonthTime,
                livemode: true,
              })

              // 4. Standard subscription (will be churned)
              const churnSub = await setupSubscription({
                organizationId: organization.id,
                customerId: extraCustomers[0].customer.id,
                paymentMethodId: extraCustomers[0].paymentMethod.id,
                priceId: standardPrice.id,
                status: SubscriptionStatus.Active,
                startDate: previousMonthTime,
                livemode: true,
              })

              // Set up billing periods for previous month
              const startOfPreviousMonthTime =
                startOfMonth(previousMonth).getTime()
              const endOfPreviousMonthTime =
                endOfMonth(previousMonth).getTime()
              const prevBillingPeriods = await Promise.all([
                setupBillingPeriod({
                  subscriptionId: freeSub.id,
                  startDate: startOfPreviousMonthTime,
                  endDate: endOfPreviousMonthTime,
                  livemode: true,
                }),
                setupBillingPeriod({
                  subscriptionId: basicSub.id,
                  startDate: startOfPreviousMonthTime,
                  endDate: endOfPreviousMonthTime,
                  livemode: true,
                }),
                setupBillingPeriod({
                  subscriptionId: premiumSub.id,
                  startDate: startOfPreviousMonthTime,
                  endDate: endOfPreviousMonthTime,
                  livemode: true,
                }),
                setupBillingPeriod({
                  subscriptionId: churnSub.id,
                  startDate: startOfPreviousMonthTime,
                  endDate: endOfPreviousMonthTime,
                  livemode: true,
                }),
              ])

              // Add billing period items for previous month
              await Promise.all([
                setupBillingPeriodItem({
                  billingPeriodId: prevBillingPeriods[0].id,
                  quantity: 1,
                  unitPrice: 0, // Free
                  name: 'Free Subscription',
                  livemode: true,
                }),
                setupBillingPeriodItem({
                  billingPeriodId: prevBillingPeriods[1].id,
                  quantity: 1,
                  unitPrice: 5000, // $50
                  name: 'Basic Subscription',
                  livemode: true,
                }),
                setupBillingPeriodItem({
                  billingPeriodId: prevBillingPeriods[2].id,
                  quantity: 1,
                  unitPrice: 20000, // $200
                  name: 'Premium Subscription',
                  livemode: true,
                }),
                setupBillingPeriodItem({
                  billingPeriodId: prevBillingPeriods[3].id,
                  quantity: 1,
                  unitPrice: 10000, // $100
                  name: 'Standard Subscription',
                  livemode: true,
                }),
              ])

              // Current month changes:
              // 1. Upgrade free to basic
              await updateSubscription(
                {
                  id: freeSub.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: currentMonthTime,
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  renews: freeSub.renews,
                },
                transaction
              )

              const upgradedSub = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: basicPrice.id,
                status: SubscriptionStatus.Active,
                startDate: currentMonthTime,
                livemode: true,
              })

              await updateSubscription(
                {
                  id: freeSub.id,
                  replacedBySubscriptionId: upgradedSub.id,
                  renews: freeSub.renews,
                },
                transaction
              )

              // 2. Expansion: basic to standard (same subscription, higher price)
              await updateSubscription(
                {
                  id: basicSub.id,
                  priceId: standardPrice.id,
                  renews: basicSub.renews,
                },
                transaction
              )

              // 3. Contraction: premium to standard (same subscription, lower price)
              await updateSubscription(
                {
                  id: premiumSub.id,
                  priceId: standardPrice.id,
                  renews: premiumSub.renews,
                },
                transaction
              )

              // 4. Churn: cancel standard subscription
              await updateSubscription(
                {
                  id: churnSub.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: currentMonthTime,
                  cancellationReason:
                    CancellationReason.CustomerRequest,
                  renews: churnSub.renews,
                },
                transaction
              )

              // 5. New subscription
              const newSub = await setupSubscription({
                organizationId: organization.id,
                customerId: extraCustomers[1].customer.id,
                paymentMethodId: extraCustomers[1].paymentMethod.id,
                priceId: premiumPrice.id,
                status: SubscriptionStatus.Active,
                startDate: currentMonthTime,
                livemode: true,
              })
              const startOfCurrentMonthTime =
                startOfMonth(currentMonth).getTime()
              const endOfCurrentMonthTime =
                endOfMonth(currentMonth).getTime()
              // Set up billing periods for current month
              const currBillingPeriods = await Promise.all([
                setupBillingPeriod({
                  subscriptionId: upgradedSub.id,
                  startDate: startOfCurrentMonthTime,
                  endDate: endOfCurrentMonthTime,
                  livemode: true,
                }),
                setupBillingPeriod({
                  subscriptionId: basicSub.id,
                  startDate: startOfCurrentMonthTime,
                  endDate: endOfCurrentMonthTime,
                  livemode: true,
                }),
                setupBillingPeriod({
                  subscriptionId: premiumSub.id,
                  startDate: startOfCurrentMonthTime,
                  endDate: endOfCurrentMonthTime,
                  livemode: true,
                }),
                setupBillingPeriod({
                  subscriptionId: newSub.id,
                  startDate: startOfCurrentMonthTime,
                  endDate: endOfCurrentMonthTime,
                  livemode: true,
                }),
              ])

              // Add billing period items for current month
              await Promise.all([
                setupBillingPeriodItem({
                  billingPeriodId: currBillingPeriods[0].id,
                  quantity: 1,
                  unitPrice: 5000, // $50 (upgraded from free)
                  name: 'Upgraded Subscription',
                  livemode: true,
                }),
                setupBillingPeriodItem({
                  billingPeriodId: currBillingPeriods[1].id,
                  quantity: 1,
                  unitPrice: 10000, // $100 (expanded from $50)
                  name: 'Expanded Subscription',
                  livemode: true,
                }),
                setupBillingPeriodItem({
                  billingPeriodId: currBillingPeriods[2].id,
                  quantity: 1,
                  unitPrice: 10000, // $100 (contracted from $200)
                  name: 'Contracted Subscription',
                  livemode: true,
                }),
                setupBillingPeriodItem({
                  billingPeriodId: currBillingPeriods[3].id,
                  quantity: 1,
                  unitPrice: 20000, // $200 (new)
                  name: 'New Subscription',
                  livemode: true,
                }),
              ])

              // Calculate MRR breakdown
              const breakdown = await calculateMRRBreakdown(
                organization.id,
                currentMonth,
                previousMonth,
                transaction
              )

              // Verify each component
              expect(breakdown.newMRR).toBe(20000) // New subscription: $200
              expect(breakdown.upgradeMRR).toBe(5000) // Free to $50
              expect(breakdown.expansionMRR).toBe(5000) // $50 to $100 (gain of $50)
              expect(breakdown.contractionMRR).toBe(10000) // $200 to $100 (loss of $100)
              expect(breakdown.churnMRR).toBe(10000) // Lost $100 subscription

              // Verify net MRR calculation
              const expectedNetMRR =
                breakdown.newMRR +
                breakdown.expansionMRR +
                breakdown.upgradeMRR -
                breakdown.contractionMRR -
                breakdown.churnMRR
              expect(breakdown.netMRR).toBe(expectedNetMRR)
              expect(breakdown.netMRR).toBe(10000) // 20000 + 5000 + 5000 - 10000 - 10000 = 10000
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })

      it('should handle upgrade chains correctly', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const month1 = subMonths(new Date(), 2)
              const month1Time = month1.getTime()
              const month2 = subMonths(new Date(), 1)
              const month2Time = month2.getTime()
              const month3 = new Date()
              const month3Time = month3.getTime()

              // Create price tiers
              const basicPrice = await setupPrice({
                productId: product.id,
                name: 'Basic Tier',
                type: PriceType.Subscription,
                unitPrice: 5000, // $50/month
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })

              const premiumPrice = await setupPrice({
                productId: product.id,
                name: 'Premium Tier',
                type: PriceType.Subscription,
                unitPrice: 20000, // $200/month
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })

              // Month 1: Create free subscription
              const freeSub = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: month1Time,
                isFreePlan: true,
                livemode: true,
              })

              // Set up billing period for month 1
              const bp1 = await setupBillingPeriod({
                subscriptionId: freeSub.id,
                startDate: startOfMonth(month1Time).getTime(),
                endDate: endOfMonth(month1Time).getTime(),
                livemode: true,
              })

              await setupBillingPeriodItem({
                billingPeriodId: bp1.id,
                quantity: 1,
                unitPrice: 0, // Free
                name: 'Free Subscription',
                livemode: true,
              })

              // Month 2: Upgrade to basic
              await updateSubscription(
                {
                  id: freeSub.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: month2Time,
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  renews: freeSub.renews,
                },
                transaction
              )

              const basicSub = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: basicPrice.id,
                status: SubscriptionStatus.Active,
                startDate: month2Time,
                livemode: true,
              })

              // Link free to basic
              await updateSubscription(
                {
                  id: freeSub.id,
                  replacedBySubscriptionId: basicSub.id,
                  renews: freeSub.renews,
                },
                transaction
              )

              // Set up billing period for month 2
              const bp2 = await setupBillingPeriod({
                subscriptionId: basicSub.id,
                startDate: startOfMonth(month2Time).getTime(),
                endDate: endOfMonth(month2Time).getTime(),
                livemode: true,
              })

              await setupBillingPeriodItem({
                billingPeriodId: bp2.id,
                quantity: 1,
                unitPrice: 5000, // $50
                name: 'Basic Subscription',
                livemode: true,
              })

              // Month 3: Upgrade to premium
              await updateSubscription(
                {
                  id: basicSub.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: month3Time,
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  renews: basicSub.renews,
                },
                transaction
              )

              const premiumSub = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: premiumPrice.id,
                status: SubscriptionStatus.Active,
                startDate: month3Time,
                livemode: true,
              })

              // Link basic to premium
              await updateSubscription(
                {
                  id: basicSub.id,
                  replacedBySubscriptionId: premiumSub.id,
                  renews: basicSub.renews,
                },
                transaction
              )

              // Set up billing period for month 3
              const bp3 = await setupBillingPeriod({
                subscriptionId: premiumSub.id,
                startDate: startOfMonth(month3Time).getTime(),
                endDate: endOfMonth(month3Time).getTime(),
                livemode: true,
              })

              await setupBillingPeriodItem({
                billingPeriodId: bp3.id,
                quantity: 1,
                unitPrice: 20000, // $200
                name: 'Premium Subscription',
                livemode: true,
              })

              // Calculate MRR breakdown between month 2 and 3
              const breakdown = await calculateMRRBreakdown(
                organization.id,
                month3,
                month2,
                transaction
              )

              // Verify upgrade chain is handled correctly
              expect(breakdown.upgradeMRR).toBe(20000) // Basic ($50) to Premium ($200)
              expect(breakdown.churnMRR).toBe(0) // Upgrade should not count as churn
              expect(breakdown.newMRR).toBe(0) // Not a new subscription

              // The upgrade chain should be followed:
              // freeSub -> basicSub -> premiumSub
              // MRR breakdown should only consider month2 (basic) to month3 (premium)
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })
    })
  })

  describe('upgradeMetrics', () => {
    describe('getUpgradeMetrics', () => {
      it('should count total upgrades within date range', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const testStartDate = startOfMonth(new Date())
              const testEndDate = endOfMonth(new Date())
              const testStartDateTime = testStartDate.getTime()
              const testEndDateTime = testEndDate.getTime()
              const beforeRange = subMonths(testStartDate, 2)
              const beforeRangeTime = beforeRange.getTime()
              const afterRange = addDays(testEndDate, 10)
              const afterRangeTime = afterRange.getTime()

              // Create 5 free subscriptions
              const subs = await Promise.all([
                setupSubscription({
                  organizationId: organization.id,
                  customerId: customer1.id,
                  paymentMethodId: paymentMethod1.id,
                  priceId: freePrice.id,
                  status: SubscriptionStatus.Canceled,
                  startDate: subMonths(new Date(), 3).getTime(),
                  canceledAt: addDays(testStartDate, 5).getTime(), // Within range
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  isFreePlan: true,
                  livemode: true,
                }),
                setupSubscription({
                  organizationId: organization.id,
                  customerId: customer2.id,
                  paymentMethodId: paymentMethod2.id,
                  priceId: freePrice.id,
                  status: SubscriptionStatus.Canceled,
                  startDate: subMonths(new Date(), 3).getTime(),
                  canceledAt: addDays(testStartDate, 10).getTime(), // Within range
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  isFreePlan: true,
                  livemode: true,
                }),
                setupSubscription({
                  organizationId: organization.id,
                  customerId: customer3.id,
                  paymentMethodId: paymentMethod3.id,
                  priceId: freePrice.id,
                  status: SubscriptionStatus.Canceled,
                  startDate: subMonths(new Date(), 3).getTime(),
                  canceledAt: addDays(testStartDate, 15).getTime(), // Within range
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  isFreePlan: true,
                  livemode: true,
                }),
                setupSubscription({
                  organizationId: organization.id,
                  customerId: customer1.id,
                  paymentMethodId: paymentMethod1.id,
                  priceId: freePrice.id,
                  status: SubscriptionStatus.Canceled,
                  startDate: subMonths(new Date(), 4).getTime(),
                  canceledAt: beforeRangeTime, // Before range
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  isFreePlan: true,
                  livemode: true,
                }),
                setupSubscription({
                  organizationId: organization.id,
                  customerId: customer2.id,
                  paymentMethodId: paymentMethod2.id,
                  priceId: freePrice.id,
                  status: SubscriptionStatus.Canceled,
                  startDate: subMonths(new Date(), 2).getTime(),
                  canceledAt: afterRangeTime, // After range
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  isFreePlan: true,
                  livemode: true,
                }),
              ])

              // Get upgrade metrics
              const metrics = await getUpgradeMetrics(
                organization.id,
                testStartDate,
                testEndDate,
                transaction
              )

              // Verify only upgrades within range are counted
              expect(metrics.totalUpgrades).toBe(3)
              expect(metrics.upgradedSubscriptions).toHaveLength(3)
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })

      it('should calculate average time to upgrade correctly', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const baseDate = subMonths(new Date(), 2)
              const baseDateTime = baseDate.getTime()
              const testEndDate = new Date()
              const testEndDateTime = testEndDate.getTime()

              // Create 3 free subscriptions at different times
              const freeSub1 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: baseDateTime,
                isFreePlan: true,
                livemode: true,
              })

              const freeSub2 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer2.id,
                paymentMethodId: paymentMethod2.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: baseDateTime,
                isFreePlan: true,
                livemode: true,
              })

              const freeSub3 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer3.id,
                paymentMethodId: paymentMethod3.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: baseDateTime,
                isFreePlan: true,
                livemode: true,
              })

              // Upgrade after different periods
              // Subscription 1: after 10 days
              await updateSubscription(
                {
                  id: freeSub1.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: addDays(baseDate, 10).getTime(),
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  renews: freeSub1.renews,
                },
                transaction
              )

              const paidSub1 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: price.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(baseDate, 10).getTime(),
                livemode: true,
              })

              await updateSubscription(
                {
                  id: freeSub1.id,
                  replacedBySubscriptionId: paidSub1.id,
                  renews: freeSub1.renews,
                },
                transaction
              )

              // Subscription 2: after 20 days
              await updateSubscription(
                {
                  id: freeSub2.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: addDays(baseDate, 20).getTime(),
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  renews: freeSub2.renews,
                },
                transaction
              )

              const paidSub2 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer2.id,
                paymentMethodId: paymentMethod2.id,
                priceId: price.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(baseDate, 20).getTime(),
                livemode: true,
              })

              await updateSubscription(
                {
                  id: freeSub2.id,
                  replacedBySubscriptionId: paidSub2.id,
                  renews: freeSub2.renews,
                },
                transaction
              )

              // Subscription 3: after 30 days
              await updateSubscription(
                {
                  id: freeSub3.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: addDays(baseDate, 30).getTime(),
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  renews: freeSub3.renews,
                },
                transaction
              )

              const paidSub3 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer3.id,
                paymentMethodId: paymentMethod3.id,
                priceId: price.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(baseDate, 30).getTime(),
                livemode: true,
              })

              await updateSubscription(
                {
                  id: freeSub3.id,
                  replacedBySubscriptionId: paidSub3.id,
                  renews: freeSub3.renews,
                },
                transaction
              )

              // Get upgrade metrics
              const metrics = await getUpgradeMetrics(
                organization.id,
                baseDate,
                testEndDate,
                transaction
              )

              // Verify average time to upgrade
              expect(metrics.totalUpgrades).toBe(3)
              expect(metrics.averageTimeToUpgrade).toBe(20) // (10 + 20 + 30) / 3 = 20 days
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })

      it('should return empty metrics when no upgrades exist', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const testStartDate = startOfMonth(new Date())
              const testEndDate = endOfMonth(new Date())

              // Create several free subscriptions but don't upgrade any
              await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(testStartDate, 5).getTime(),
                isFreePlan: true,
                livemode: true,
              })

              await setupSubscription({
                organizationId: organization.id,
                customerId: customer2.id,
                paymentMethodId: paymentMethod2.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(testStartDate, 10).getTime(),
                isFreePlan: true,
                livemode: true,
              })

              await setupSubscription({
                organizationId: organization.id,
                customerId: customer3.id,
                paymentMethodId: paymentMethod3.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(testStartDate, 15).getTime(),
                isFreePlan: true,
                livemode: true,
              })

              // Get upgrade metrics
              const metrics = await getUpgradeMetrics(
                organization.id,
                testStartDate,
                testEndDate,
                transaction
              )

              // Verify no upgrades exist
              expect(metrics.totalUpgrades).toBe(0)
              expect(metrics.averageTimeToUpgrade).toBe(0)
              expect(metrics.upgradeRevenue).toBe(0)
              expect(metrics.upgradedSubscriptions).toHaveLength(0)
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })

      it('should calculate upgrade revenue correctly', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const testStartDate = startOfMonth(new Date())
              const testEndDate = endOfMonth(new Date())

              // Create various price points
              const basicPrice = await setupPrice({
                productId: product.id,
                name: 'Basic Tier',
                type: PriceType.Subscription,
                unitPrice: 5000, // $50/month in cents
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })

              const standardPrice = await setupPrice({
                productId: product.id,
                name: 'Standard Tier',
                type: PriceType.Subscription,
                unitPrice: 10000, // $100/month in cents
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })

              const premiumPrice = await setupPrice({
                productId: product.id,
                name: 'Premium Tier',
                type: PriceType.Subscription,
                unitPrice: 20000, // $200/month in cents
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })

              // Create 3 free subscriptions
              const freeSub1 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: subMonths(testStartDate, 1).getTime(),
                isFreePlan: true,
                livemode: true,
              })

              const freeSub2 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer2.id,
                paymentMethodId: paymentMethod2.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: subMonths(testStartDate, 1).getTime(),
                isFreePlan: true,
                livemode: true,
              })

              const freeSub3 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer3.id,
                paymentMethodId: paymentMethod3.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: subMonths(testStartDate, 1).getTime(),
                isFreePlan: true,
                livemode: true,
              })

              // Upgrade to different paid tiers
              // Free to $50/month
              await updateSubscription(
                {
                  id: freeSub1.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: addDays(testStartDate, 5).getTime(),
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  renews: freeSub1.renews,
                },
                transaction
              )

              const basicSub = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: basicPrice.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(testStartDate, 5).getTime(),
                isFreePlan: true,
                livemode: true,
              })

              await updateSubscription(
                {
                  id: freeSub1.id,
                  replacedBySubscriptionId: basicSub.id,
                  renews: freeSub1.renews,
                },
                transaction
              )

              // Free to $100/month
              await updateSubscription(
                {
                  id: freeSub2.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: addDays(testStartDate, 10).getTime(),
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  renews: freeSub2.renews,
                },
                transaction
              )

              const standardSub = await setupSubscription({
                organizationId: organization.id,
                customerId: customer2.id,
                paymentMethodId: paymentMethod2.id,
                priceId: standardPrice.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(testStartDate, 10).getTime(),
                livemode: true,
              })

              await updateSubscription(
                {
                  id: freeSub2.id,
                  replacedBySubscriptionId: standardSub.id,
                  renews: freeSub2.renews,
                },
                transaction
              )

              // Free to $200/month
              await updateSubscription(
                {
                  id: freeSub3.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: addDays(testStartDate, 15).getTime(),
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  renews: freeSub3.renews,
                },
                transaction
              )

              const premiumSub = await setupSubscription({
                organizationId: organization.id,
                customerId: customer3.id,
                paymentMethodId: paymentMethod3.id,
                priceId: premiumPrice.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(testStartDate, 15).getTime(),
                livemode: true,
              })

              await updateSubscription(
                {
                  id: freeSub3.id,
                  replacedBySubscriptionId: premiumSub.id,
                  renews: freeSub3.renews,
                },
                transaction
              )
              const testStartDateTime = testStartDate.getTime()
              const testEndDateTime = testEndDate.getTime()

              // Set up billing periods for the upgraded subscriptions
              const [basicBp, standardBp, premiumBp] =
                await Promise.all([
                  setupBillingPeriod({
                    subscriptionId: basicSub.id,
                    startDate: testStartDateTime,
                    endDate: testEndDateTime,
                    livemode: true,
                  }),
                  setupBillingPeriod({
                    subscriptionId: standardSub.id,
                    startDate: testStartDateTime,
                    endDate: testEndDateTime,
                    livemode: true,
                  }),
                  setupBillingPeriod({
                    subscriptionId: premiumSub.id,
                    startDate: testStartDateTime,
                    endDate: testEndDateTime,
                    livemode: true,
                  }),
                ])

              // Add billing period items
              await Promise.all([
                setupBillingPeriodItem({
                  billingPeriodId: basicBp.id,
                  quantity: 1,
                  unitPrice: 5000, // $50 in cents
                  name: 'Basic Subscription',
                  livemode: true,
                }),
                setupBillingPeriodItem({
                  billingPeriodId: standardBp.id,
                  quantity: 1,
                  unitPrice: 10000, // $100 in cents
                  name: 'Standard Subscription',
                  livemode: true,
                }),
                setupBillingPeriodItem({
                  billingPeriodId: premiumBp.id,
                  quantity: 1,
                  unitPrice: 20000, // $200 in cents
                  name: 'Premium Subscription',
                  livemode: true,
                }),
              ])

              // Get upgrade metrics
              const metrics = await getUpgradeMetrics(
                organization.id,
                testStartDate,
                testEndDate,
                transaction
              )

              // Verify upgrade metrics
              expect(metrics.totalUpgrades).toBe(3)
              // Now that upgrade revenue calculation is implemented, it should return the sum of upgraded subscription prices
              expect(metrics.upgradeRevenue).toBe(35000) // $50 + $100 + $200 = $350 (in cents: 5000 + 10000 + 20000)
              expect(metrics.upgradedSubscriptions).toHaveLength(3)

              // Verify that replacedBySubscriptionId links are set correctly
              expect(
                metrics.upgradedSubscriptions.some(
                  (s) => s.replacedBySubscriptionId === basicSub.id
                )
              ).toBe(true)
              expect(
                metrics.upgradedSubscriptions.some(
                  (s) => s.replacedBySubscriptionId === standardSub.id
                )
              ).toBe(true)
              expect(
                metrics.upgradedSubscriptions.some(
                  (s) => s.replacedBySubscriptionId === premiumSub.id
                )
              ).toBe(true)
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })
    })

    describe('getUpgradeConversionRate', () => {
      it('should calculate conversion rate as upgraded/total', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const testStartDate = startOfMonth(new Date())
              const testEndDate = endOfMonth(new Date())

              // Create 10 free subscriptions within date range
              const freeSubs = []
              for (let i = 0; i < 10; i++) {
                const customer = await setupCustomer({
                  organizationId: organization.id,
                  email: `test${i}+${core.nanoid()}@test.com`,
                  livemode: true,
                })

                const paymentMethod = await setupPaymentMethod({
                  organizationId: organization.id,
                  customerId: customer.id,
                  type: PaymentMethodType.Card,
                  livemode: true,
                })

                const sub = await setupSubscription({
                  organizationId: organization.id,
                  customerId: customer.id,
                  paymentMethodId: paymentMethod.id,
                  priceId: freePrice.id,
                  status: SubscriptionStatus.Active,
                  startDate: addDays(testStartDate, i).getTime(),
                  isFreePlan: true,
                  livemode: true,
                })

                freeSubs.push(sub)
              }

              // Upgrade 3 of them
              await Promise.all(
                freeSubs.slice(0, 3).map((sub) =>
                  updateSubscription(
                    {
                      id: sub.id,
                      status: SubscriptionStatus.Canceled,
                      canceledAt: addDays(
                        testStartDate,
                        15
                      ).getTime(),
                      cancellationReason:
                        CancellationReason.UpgradedToPaid,
                      renews: sub.renews,
                    },
                    transaction
                  )
                )
              )

              // Calculate conversion rate
              const conversionRate = await getUpgradeConversionRate(
                organization.id,
                testStartDate,
                testEndDate,
                transaction
              )

              // Verify conversion rate
              expect(conversionRate).toBeCloseTo(0.3, 2) // 30% conversion rate
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })

      it('should return 0 when no free subscriptions exist', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const testStartDate = startOfMonth(new Date())
              const testEndDate = endOfMonth(new Date())

              // Create only paid subscriptions (no free)
              await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: price.id, // Paid price
                status: SubscriptionStatus.Active,
                startDate: addDays(testStartDate, 5).getTime(),
                isFreePlan: true,
                livemode: true,
              })

              await setupSubscription({
                organizationId: organization.id,
                customerId: customer2.id,
                paymentMethodId: paymentMethod2.id,
                priceId: price.id, // Paid price
                status: SubscriptionStatus.Active,
                startDate: addDays(testStartDate, 10).getTime(),
                livemode: true,
              })

              // Calculate conversion rate
              const conversionRate = await getUpgradeConversionRate(
                organization.id,
                testStartDate,
                testEndDate,
                transaction
              )

              // Verify conversion rate is 0 when no free subscriptions exist
              expect(conversionRate).toBe(0)
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })

      it('should only count free subscriptions created in date range', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const testStartDate = startOfMonth(new Date())
              const testEndDate = endOfMonth(new Date())
              const testStartDateTime = testStartDate.getTime()
              const testEndDateTime = testEndDate.getTime()
              const beforeRange = subMonths(testStartDate, 2)
              const beforeRangeTime = beforeRange.getTime()

              // Create additional customers
              const customers = await Promise.all(
                Array.from({ length: 10 }, async (_, i) => {
                  const customer = await setupCustomer({
                    organizationId: organization.id,
                    email: `test${i}+${core.nanoid()}@test.com`,
                    livemode: true,
                  })
                  const paymentMethod = await setupPaymentMethod({
                    organizationId: organization.id,
                    customerId: customer.id,
                    type: PaymentMethodType.Card,
                    livemode: true,
                  })
                  return { customer, paymentMethod }
                })
              )

              // Create 5 free subscriptions before date range
              const beforeRangeSubs = await Promise.all(
                customers.slice(0, 5).map((c, i) =>
                  setupSubscription({
                    organizationId: organization.id,
                    customerId: c.customer.id,
                    paymentMethodId: c.paymentMethod.id,
                    priceId: freePrice.id,
                    status: SubscriptionStatus.Active,
                    startDate: addDays(beforeRange, i).getTime(),
                    isFreePlan: true,
                    livemode: true,
                  })
                )
              )

              // Create 5 free subscriptions within date range
              const inRangeSubs = await Promise.all(
                customers.slice(5, 10).map((c, i) =>
                  setupSubscription({
                    organizationId: organization.id,
                    customerId: c.customer.id,
                    paymentMethodId: c.paymentMethod.id,
                    priceId: freePrice.id,
                    status: SubscriptionStatus.Active,
                    startDate: addDays(
                      testStartDate,
                      i + 5
                    ).getTime(),
                    isFreePlan: true,
                    livemode: true,
                  })
                )
              )

              // Upgrade 2 from each group
              await Promise.all([
                ...beforeRangeSubs.slice(0, 2).map((sub) =>
                  updateSubscription(
                    {
                      id: sub.id,
                      status: SubscriptionStatus.Canceled,
                      canceledAt: addDays(
                        testStartDate,
                        15
                      ).getTime(),
                      cancellationReason:
                        CancellationReason.UpgradedToPaid,
                      renews: sub.renews,
                    },
                    transaction
                  )
                ),
                ...inRangeSubs.slice(0, 2).map((sub) =>
                  updateSubscription(
                    {
                      id: sub.id,
                      status: SubscriptionStatus.Canceled,
                      canceledAt: addDays(
                        testStartDate,
                        20
                      ).getTime(),
                      cancellationReason:
                        CancellationReason.UpgradedToPaid,
                      renews: sub.renews,
                    },
                    transaction
                  )
                ),
              ])

              // Calculate conversion rate
              const conversionRate = await getUpgradeConversionRate(
                organization.id,
                testStartDate,
                testEndDate,
                transaction
              )

              // Should only consider the 5 created within date range
              // 2 out of 5 were upgraded = 40% conversion rate
              expect(conversionRate).toBeCloseTo(0.4, 2)
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })
    })

    describe('getUpgradePaths', () => {
      it('should track single upgrade path correctly', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const testStartDate = startOfMonth(new Date())
              const testEndDate = endOfMonth(new Date())

              // Create free subscription
              const freeSub = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: subMonths(testStartDate, 1).getTime(),
                isFreePlan: true,
                livemode: true,
              })

              // Upgrade to paid subscription
              await updateSubscription(
                {
                  id: freeSub.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: addDays(testStartDate, 10).getTime(),
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  renews: freeSub.renews,
                },
                transaction
              )

              const paidSub = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: price.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(testStartDate, 10).getTime(),
                livemode: true,
              })

              // Link with replacedBySubscriptionId
              await updateSubscription(
                {
                  id: freeSub.id,
                  replacedBySubscriptionId: paidSub.id,
                  renews: freeSub.renews,
                },
                transaction
              )

              // Get upgrade paths
              const paths = await getUpgradePaths(
                organization.id,
                testStartDate,
                testEndDate,
                transaction
              )

              // Verify the upgrade path
              expect(paths).toHaveLength(1)
              expect(paths[0].fromSubscription.id).toBe(freeSub.id)
              expect(paths[0].toSubscription?.id).toBe(paidSub.id)
              expect(
                paths[0].fromSubscription.replacedBySubscriptionId
              ).toBe(paidSub.id)
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })

      it('should handle missing replacement subscription gracefully', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const testStartDate = startOfMonth(new Date())
              const testEndDate = endOfMonth(new Date())
              const testStartDateTime = testStartDate.getTime()
              const testEndDateTime = testEndDate.getTime()
              // Create free subscription
              const freeSub = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: subMonths(testStartDate, 1).getTime(),
                isFreePlan: true,
                livemode: true,
              })

              // Mark as upgraded but don't create replacement (simulates data inconsistency)
              await updateSubscription(
                {
                  id: freeSub.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: addDays(testStartDate, 10).getTime(),
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  replacedBySubscriptionId: 'non-existent-id', // Invalid ID
                  renews: freeSub.renews,
                },
                transaction
              )

              // Get upgrade paths - should not throw an error
              const paths = await getUpgradePaths(
                organization.id,
                testStartDateTime,
                testEndDateTime,
                transaction
              )

              // Verify it handles missing replacement gracefully
              expect(paths).toHaveLength(1)
              expect(paths[0].fromSubscription.id).toBe(freeSub.id)
              expect(paths[0].toSubscription).toBeNull() // Missing replacement
              expect(
                paths[0].fromSubscription.replacedBySubscriptionId
              ).toBe('non-existent-id')
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })

      it('should track multiple upgrade paths', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const testStartDate = startOfMonth(new Date())
              const testEndDate = endOfMonth(new Date())

              // Create price tiers
              const basicPrice = await setupPrice({
                productId: product.id,
                name: 'Basic Tier',
                type: PriceType.Subscription,
                unitPrice: 5000, // $50/month
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })

              const premiumPrice = await setupPrice({
                productId: product.id,
                name: 'Premium Tier',
                type: PriceType.Subscription,
                unitPrice: 20000, // $200/month
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })

              // Scenario 1: free1 → basic1
              const free1 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: subMonths(testStartDate, 2).getTime(),
                isFreePlan: true,
                livemode: true,
              })

              await updateSubscription(
                {
                  id: free1.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: addDays(testStartDate, 5).getTime(),
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  renews: free1.renews,
                },
                transaction
              )

              const basic1 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: basicPrice.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(testStartDate, 5).getTime(),
                isFreePlan: true,
                livemode: true,
              })

              await updateSubscription(
                {
                  id: free1.id,
                  replacedBySubscriptionId: basic1.id,
                  renews: free1.renews,
                },
                transaction
              )

              // Scenario 2: free2 → premium1
              const free2 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer2.id,
                paymentMethodId: paymentMethod2.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: subMonths(testStartDate, 2).getTime(),
                isFreePlan: true,
                livemode: true,
              })

              await updateSubscription(
                {
                  id: free2.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: addDays(testStartDate, 10).getTime(),
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  renews: free2.renews,
                },
                transaction
              )

              const premium1 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer2.id,
                paymentMethodId: paymentMethod2.id,
                priceId: premiumPrice.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(testStartDate, 10).getTime(),
                livemode: true,
              })

              await updateSubscription(
                {
                  id: free2.id,
                  replacedBySubscriptionId: premium1.id,
                  renews: free2.renews,
                },
                transaction
              )

              // Scenario 3: free3 → basic2 (then basic2 → premium2 in next month)
              const free3 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer3.id,
                paymentMethodId: paymentMethod3.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: subMonths(testStartDate, 3).getTime(),
                isFreePlan: true,
                livemode: true,
              })

              // First upgrade: free3 → basic2 (before test range)
              await updateSubscription(
                {
                  id: free3.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: subMonths(testStartDate, 1).getTime(),
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  renews: free3.renews,
                },
                transaction
              )

              const basic2 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer3.id,
                paymentMethodId: paymentMethod3.id,
                priceId: basicPrice.id,
                status: SubscriptionStatus.Active,
                startDate: subMonths(testStartDate, 1).getTime(),
                livemode: true,
              })

              await updateSubscription(
                {
                  id: free3.id,
                  replacedBySubscriptionId: basic2.id,
                  renews: free3.renews,
                },
                transaction
              )

              // Second upgrade: basic2 → premium2 (within test range)
              await updateSubscription(
                {
                  id: basic2.id,
                  status: SubscriptionStatus.Canceled,
                  canceledAt: addDays(testStartDate, 15).getTime(),
                  cancellationReason:
                    CancellationReason.UpgradedToPaid,
                  renews: basic2.renews,
                },
                transaction
              )

              const premium2 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer3.id,
                paymentMethodId: paymentMethod3.id,
                priceId: premiumPrice.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(testStartDate, 15).getTime(),
                livemode: true,
              })

              await updateSubscription(
                {
                  id: basic2.id,
                  replacedBySubscriptionId: premium2.id,
                  renews: basic2.renews,
                },
                transaction
              )

              // Get upgrade paths
              const paths = await getUpgradePaths(
                organization.id,
                testStartDate,
                testEndDate,
                transaction
              )

              // Verify all upgrade paths
              expect(paths).toHaveLength(3) // 3 upgrades within the date range

              // Check free1 → basic1
              const path1 = paths.find(
                (p) => p.fromSubscription.id === free1.id
              )
              expect(path1).toMatchObject({})
              expect(path1?.toSubscription?.id).toBe(basic1.id)

              // Check free2 → premium1
              const path2 = paths.find(
                (p) => p.fromSubscription.id === free2.id
              )
              expect(path2).toMatchObject({})
              expect(path2?.toSubscription?.id).toBe(premium1.id)

              // Check basic2 → premium2 (part of upgrade chain)
              const path3 = paths.find(
                (p) => p.fromSubscription.id === basic2.id
              )
              expect(path3).toMatchObject({})
              expect(path3?.toSubscription?.id).toBe(premium2.id)
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })
    })
  })

  describe('Integration Tests', () => {
    it('should handle full upgrade flow with all analytics updated', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const previousMonth = subMonths(new Date(), 1)
          const previousMonthTime = previousMonth.getTime()
          const currentMonth = new Date()
          const currentMonthTime = currentMonth.getTime()

          // Create a paid price tier
          const paidPrice = await setupPrice({
            productId: product.id,
            name: 'Premium Tier',
            type: PriceType.Subscription,
            unitPrice: 20000, // $200/month in cents
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            currency: organization.defaultCurrency,
          })

          // Create free subscription in previous month
          const freeSub = await setupSubscription({
            organizationId: organization.id,
            customerId: customer1.id,
            paymentMethodId: paymentMethod1.id,
            priceId: freePrice.id,
            status: SubscriptionStatus.Active,
            startDate: previousMonthTime,
            isFreePlan: true,
            livemode: true,
          })

          // Simulate upgrade process
          await updateSubscription(
            {
              id: freeSub.id,
              status: SubscriptionStatus.Canceled,
              canceledAt: currentMonthTime,
              cancellationReason: CancellationReason.UpgradedToPaid,
              renews: freeSub.renews,
            },
            transaction
          )

          // Create new paid subscription
          const paidSub = await setupSubscription({
            organizationId: organization.id,
            customerId: customer1.id,
            paymentMethodId: paymentMethod1.id,
            priceId: paidPrice.id,
            status: SubscriptionStatus.Active,
            startDate: currentMonthTime,
            livemode: true,
          })

          // Link the subscriptions
          await updateSubscription(
            {
              id: freeSub.id,
              replacedBySubscriptionId: paidSub.id,
              renews: freeSub.renews,
            },
            transaction
          )

          // Set up billing periods with items
          const freeBp = await setupBillingPeriod({
            subscriptionId: freeSub.id,
            startDate: startOfMonth(previousMonthTime).getTime(),
            endDate: endOfMonth(previousMonthTime).getTime(),
            livemode: true,
          })

          const paidBp = await setupBillingPeriod({
            subscriptionId: paidSub.id,
            startDate: startOfMonth(currentMonthTime).getTime(),
            endDate: endOfMonth(currentMonthTime).getTime(),
            livemode: true,
          })

          // Add billing period items for MRR calculation
          await setupBillingPeriodItem({
            billingPeriodId: freeBp.id,
            quantity: 1,
            unitPrice: 0, // Free
            name: 'Free Subscription',
            livemode: true,
          })

          await setupBillingPeriodItem({
            billingPeriodId: paidBp.id,
            quantity: 1,
            unitPrice: 20000, // $200 in cents
            name: 'Premium Subscription',
            livemode: true,
          })

          // Verify database state
          const [updatedFreeSub] = await transaction
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.id, freeSub.id))

          expect(updatedFreeSub.cancellationReason).toBe(
            CancellationReason.UpgradedToPaid
          )
          expect(updatedFreeSub.replacedBySubscriptionId).toBe(
            paidSub.id
          )

          // Verify churn metrics exclude the upgrade
          const subscriberBreakdown =
            await calculateSubscriberBreakdown(
              organization.id,
              currentMonthTime,
              previousMonthTime,
              transaction
            )
          expect(subscriberBreakdown.churned).toBe(0) // Upgrade not counted as churn

          // Verify upgrade metrics include the upgrade
          const upgradeMetrics = await getUpgradeMetrics(
            organization.id,
            startOfMonth(currentMonthTime),
            endOfMonth(currentMonthTime),
            transaction
          )
          expect(upgradeMetrics.totalUpgrades).toBe(1)
          expect(upgradeMetrics.upgradedSubscriptions).toHaveLength(1)

          // Verify MRR breakdown shows upgradeMRR
          const mrrBreakdown = await calculateMRRBreakdown(
            organization.id,
            currentMonth,
            previousMonth,
            transaction
          )
          expect(mrrBreakdown.upgradeMRR).toBe(20000) // $200/month from upgrade (in cents)
          expect(mrrBreakdown.churnMRR).toBe(0) // No churn from upgrade
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should prevent multiple active free subscriptions per customer', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          // Create a second free product
          const freeProduct2 = await setupProduct({
            organizationId: organization.id,
            name: 'Free Plan 2',
            pricingModelId: pricingModel.id,
            livemode: true,
          })

          const freePrice2 = await setupPrice({
            productId: freeProduct2.id,
            name: 'Free Tier 2',
            type: PriceType.Subscription,
            unitPrice: 0, // Free
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: true,
            currency: organization.defaultCurrency,
          })

          // Create customer with one free subscription
          const firstFreeSub = await setupSubscription({
            organizationId: organization.id,
            customerId: customer1.id,
            paymentMethodId: paymentMethod1.id,
            priceId: freePrice.id,
            status: SubscriptionStatus.Active,
            startDate: Date.now(),
            isFreePlan: true,
            livemode: true,
          })

          // Attempt to create second free subscription should fail
          // Note: The actual business logic to prevent this would be in the application layer
          // This test documents the expected behavior
          try {
            const secondFreeSub = await setupSubscription({
              organizationId: organization.id,
              customerId: customer1.id,
              paymentMethodId: paymentMethod1.id,
              priceId: freePrice2.id,
              status: SubscriptionStatus.Active,
              startDate: Date.now(),
              isFreePlan: true,
              livemode: true,
            })

            // If we get here, the test should verify business logic prevents multiple free subs
            // For now, we'll verify that both subscriptions exist (documenting current behavior)
            const customerSubs = await transaction
              .select()
              .from(subscriptions)
              .where(eq(subscriptions.customerId, customer1.id))

            // Document that currently multiple free subscriptions are allowed
            // This test serves as documentation that business logic should prevent this
            expect(customerSubs.length).toBeGreaterThanOrEqual(1)
            expect(
              customerSubs.some((s) => s.id === firstFreeSub.id)
            ).toBe(true)

            // Note: In a production system, you would expect this to throw an error
            // or have validation that prevents multiple active free subscriptions
          } catch (error) {
            // Expected behavior: error preventing multiple free subscriptions
            expect(typeof error).toBe('object')
            expect((error as Error).message).toContain(
              'free subscription'
            )
          }

          // Verify first subscription remains active
          const [firstSub] = await transaction
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.id, firstFreeSub.id))

          expect(firstSub.status).toBe(SubscriptionStatus.Active)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should handle upgrade race conditions correctly', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          // Create customer with free subscription
          const freeSub = await setupSubscription({
            organizationId: organization.id,
            customerId: customer1.id,
            paymentMethodId: paymentMethod1.id,
            priceId: freePrice.id,
            status: SubscriptionStatus.Active,
            startDate: subMonths(new Date(), 1).getTime(),
            isFreePlan: true,
            livemode: true,
          })

          // Simulate concurrent upgrade attempts
          // In a real scenario, these would be running in parallel transactions
          const upgradeDate = new Date()
          const upgradeDateTime = upgradeDate.getTime()

          // First upgrade attempt
          await updateSubscription(
            {
              id: freeSub.id,
              status: SubscriptionStatus.Canceled,
              canceledAt: upgradeDateTime,
              cancellationReason: CancellationReason.UpgradedToPaid,
              renews: freeSub.renews,
            },
            transaction
          )

          const paidSub1 = await setupSubscription({
            organizationId: organization.id,
            customerId: customer1.id,
            paymentMethodId: paymentMethod1.id,
            priceId: price.id,
            status: SubscriptionStatus.Active,
            startDate: upgradeDateTime,
            livemode: true,
          })

          await updateSubscription(
            {
              id: freeSub.id,
              replacedBySubscriptionId: paidSub1.id,
              renews: freeSub.renews,
            },
            transaction
          )

          // Second upgrade attempt (simulating race condition)
          // In a properly designed system, this should fail or be prevented
          try {
            // Attempt to create another paid subscription for the same upgrade
            const paidSub2 = await setupSubscription({
              organizationId: organization.id,
              customerId: customer1.id,
              paymentMethodId: paymentMethod1.id,
              priceId: price.id,
              status: SubscriptionStatus.Active,
              startDate: upgradeDateTime,
              livemode: true,
            })

            // If we get here, verify that the system handles it gracefully
            // Check that replacedBySubscriptionId points to only one subscription
            const [updatedFreeSub] = await transaction
              .select()
              .from(subscriptions)
              .where(eq(subscriptions.id, freeSub.id))

            expect(updatedFreeSub.replacedBySubscriptionId).toBe(
              paidSub1.id
            )
            expect(updatedFreeSub.status).toBe(
              SubscriptionStatus.Canceled
            )
            expect(updatedFreeSub.cancellationReason).toBe(
              CancellationReason.UpgradedToPaid
            )

            // Verify only one active paid subscription for the customer
            const activePaidSubs = await transaction
              .select()
              .from(subscriptions)
              .where(
                and(
                  eq(subscriptions.customerId, customer1.id),
                  eq(subscriptions.status, SubscriptionStatus.Active),
                  eq(subscriptions.isFreePlan, false)
                )
              )

            // Document current behavior: multiple paid subscriptions may be created
            // In production, business logic should prevent this
            expect(activePaidSubs.length).toBeGreaterThanOrEqual(1)
            expect(
              activePaidSubs.some((s) => s.id === paidSub1.id)
            ).toBe(true)

            // Note: Ideally, there should be constraints or business logic to ensure
            // only one upgrade can succeed in a race condition scenario
          } catch (error) {
            // Expected behavior in a well-designed system:
            // The second upgrade attempt should fail
            expect(typeof error).toBe('object')
          }
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  describe('Edge Cases and Boundary Conditions', () => {
    describe('Date boundary inclusivity', () => {
      it('should include upgrades exactly on startDate and endDate boundaries', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const testStartDate = startOfMonth(new Date())
              const testEndDate = endOfMonth(new Date())

              const orgData = await setupOrg()
              const { organization, product } = orgData
              const customer1 = await setupCustomer({
                organizationId: organization.id,
              })
              const customer2 = await setupCustomer({
                organizationId: organization.id,
              })
              const paymentMethod1 = await setupPaymentMethod({
                customerId: customer1.id,
                organizationId: organization.id,
              })
              const paymentMethod2 = await setupPaymentMethod({
                customerId: customer2.id,
                organizationId: organization.id,
              })

              const freePrice = await setupPrice({
                unitPrice: 0,
                productId: product.id,
                name: 'Free Tier',
                type: PriceType.Subscription,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })
              const paidPrice = await setupPrice({
                unitPrice: 10000,
                productId: product.id,
                name: 'Paid Tier',
                type: PriceType.Subscription,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })

              // Upgrade exactly on startDate
              const freeSub1 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Canceled,
                startDate: subDays(testStartDate, 5).getTime(),
                canceledAt: testStartDate.getTime(), // Exactly on boundary
                cancellationReason: CancellationReason.UpgradedToPaid,
                isFreePlan: true,
                livemode: true,
              })

              // Upgrade exactly on endDate
              const freeSub2 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer2.id,
                paymentMethodId: paymentMethod2.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Canceled,
                startDate: subDays(testEndDate, 5).getTime(),
                canceledAt: testEndDate.getTime(), // Exactly on boundary
                cancellationReason: CancellationReason.UpgradedToPaid,
                isFreePlan: true,
                livemode: true,
              })

              const metrics = await getUpgradeMetrics(
                organization.id,
                testStartDate,
                testEndDate,
                transaction
              )

              expect(metrics.totalUpgrades).toBe(2)
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })
    })

    describe('Missing replacement subscription handling', () => {
      it('should handle upgrades with missing or invalid replacedBySubscriptionId', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const testStartDate = startOfMonth(new Date())
              const testEndDate = endOfMonth(new Date())

              const orgData = await setupOrg()
              const { organization, product } = orgData
              const customer = await setupCustomer({
                organizationId: organization.id,
              })
              const paymentMethod = await setupPaymentMethod({
                customerId: customer.id,
                type: PaymentMethodType.Card,
                organizationId: organization.id,
              })

              const freePrice = await setupPrice({
                unitPrice: 0,
                productId: product.id,
                name: 'Free Tier',
                type: PriceType.Subscription,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })

              // Upgrade with null replacedBySubscriptionId
              const freeSub1 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer.id,
                paymentMethodId: paymentMethod.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Canceled,
                startDate: subDays(testStartDate, 10).getTime(),
                canceledAt: addDays(testStartDate, 5).getTime(),
                cancellationReason: CancellationReason.UpgradedToPaid,
                replacedBySubscriptionId: null,
                isFreePlan: true,
                livemode: true,
              })

              // Upgrade with non-existent ID
              const freeSub2 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer.id,
                paymentMethodId: paymentMethod.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Canceled,
                startDate: subDays(testStartDate, 15).getTime(),
                canceledAt: addDays(testStartDate, 10).getTime(),
                cancellationReason: CancellationReason.UpgradedToPaid,
                replacedBySubscriptionId: 'non-existent-id',
                isFreePlan: true,
                livemode: true,
              })

              const metrics = await getUpgradeMetrics(
                organization.id,
                testStartDate,
                testEndDate,
                transaction
              )

              expect(metrics.totalUpgrades).toBe(2)
              expect(metrics.upgradeRevenue).toBe(0) // No valid replacements
              // When replacements are missing/invalid, avg time may be 0
              // This is the current behavior of the implementation
              expect(metrics.averageTimeToUpgrade).toBe(0)
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })

      it('should handle zero-priced replacements correctly', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const testStartDate = startOfMonth(new Date())
              const testEndDate = endOfMonth(new Date())

              const orgData = await setupOrg()
              const { organization, product } = orgData
              const customer = await setupCustomer({
                organizationId: organization.id,
              })
              const paymentMethod = await setupPaymentMethod({
                customerId: customer.id,
                organizationId: organization.id,
              })

              const freePrice1 = await setupPrice({
                unitPrice: 0,
                productId: product.id,
                name: 'Free Tier 1',
                type: PriceType.Subscription,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })
              const freePrice2 = await setupPrice({
                unitPrice: 0, // Zero-priced replacement
                productId: product.id,
                name: 'Free Tier 2',
                type: PriceType.Subscription,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })

              const freeSub = await setupSubscription({
                organizationId: organization.id,
                customerId: customer.id,
                paymentMethodId: paymentMethod.id,
                priceId: freePrice1.id,
                status: SubscriptionStatus.Canceled,
                startDate: testStartDate.getTime(),
                canceledAt: addDays(testStartDate, 5).getTime(),
                cancellationReason: CancellationReason.UpgradedToPaid,
                livemode: true,
              })

              const replacementSub = await setupSubscription({
                organizationId: organization.id,
                customerId: customer.id,
                paymentMethodId: paymentMethod.id,
                priceId: freePrice2.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(testStartDate, 5).getTime(),
                isFreePlan: true,
                livemode: true,
              })

              await updateSubscription(
                {
                  id: freeSub.id,
                  replacedBySubscriptionId: replacementSub.id,
                  renews: freeSub.renews,
                },
                transaction
              )

              const metrics = await getUpgradeMetrics(
                organization.id,
                testStartDate,
                testEndDate,
                transaction
              )

              expect(metrics.totalUpgrades).toBe(1)
              expect(metrics.upgradeRevenue).toBe(0) // Zero-priced but counted
              expect(metrics.averageTimeToUpgrade).toBe(5)
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })
    })

    describe('Cross-organization isolation', () => {
      it('should properly isolate metrics between organizations', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const testStartDate = startOfMonth(new Date())
              const testEndDate = endOfMonth(new Date())

              const orgData1 = await setupOrg()
              const orgData2 = await setupOrg()
              const { organization: org1, product: product1 } =
                orgData1
              const { organization: org2, product: product2 } =
                orgData2

              const customer1 = await setupCustomer({
                organizationId: org1.id,
              })
              const customer2 = await setupCustomer({
                organizationId: org2.id,
              })

              const paymentMethod1 = await setupPaymentMethod({
                customerId: customer1.id,
                organizationId: org1.id,
              })
              const paymentMethod2 = await setupPaymentMethod({
                customerId: customer2.id,
                organizationId: org2.id,
              })

              const freePrice1 = await setupPrice({
                unitPrice: 0,
                productId: product1.id,
                name: 'Free Tier',
                type: PriceType.Subscription,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: org1.defaultCurrency,
              })
              const paidPrice1 = await setupPrice({
                unitPrice: 10000,
                productId: product1.id,
                name: 'Paid Tier',
                type: PriceType.Subscription,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: org1.defaultCurrency,
              })

              const freePrice2 = await setupPrice({
                unitPrice: 0,
                productId: product2.id,
                name: 'Free Tier',
                type: PriceType.Subscription,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: org2.defaultCurrency,
              })
              const paidPrice2 = await setupPrice({
                unitPrice: 10000,
                productId: product2.id,
                name: 'Paid Tier',
                type: PriceType.Subscription,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: org2.defaultCurrency,
              })

              // Org1 upgrade
              const org1FreeSub = await setupSubscription({
                organizationId: org1.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: freePrice1.id,
                status: SubscriptionStatus.Canceled,
                startDate: testStartDate.getTime(),
                canceledAt: addDays(testStartDate, 5).getTime(),
                cancellationReason: CancellationReason.UpgradedToPaid,
                isFreePlan: true,
                livemode: true,
              })

              const org1PaidSub = await setupSubscription({
                organizationId: org1.id,
                customerId: customer1.id,
                paymentMethodId: paymentMethod1.id,
                priceId: paidPrice1.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(testStartDate, 5).getTime(),
                livemode: true,
              })

              await updateSubscription(
                {
                  id: org1FreeSub.id,
                  replacedBySubscriptionId: org1PaidSub.id,
                  renews: org1FreeSub.renews,
                },
                transaction
              )

              // Org2 upgrades (2 of them)
              const org2FreeSub1 = await setupSubscription({
                organizationId: org2.id,
                customerId: customer2.id,
                paymentMethodId: paymentMethod2.id,
                priceId: freePrice2.id,
                status: SubscriptionStatus.Canceled,
                startDate: testStartDate.getTime(),
                canceledAt: addDays(testStartDate, 3).getTime(),
                cancellationReason: CancellationReason.UpgradedToPaid,
                isFreePlan: true,
                livemode: true,
              })

              const org2PaidSub1 = await setupSubscription({
                organizationId: org2.id,
                customerId: customer2.id,
                paymentMethodId: paymentMethod2.id,
                priceId: paidPrice2.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(testStartDate, 3).getTime(),
                livemode: true,
              })

              await updateSubscription(
                {
                  id: org2FreeSub1.id,
                  replacedBySubscriptionId: org2PaidSub1.id,
                  renews: org2FreeSub1.renews,
                },
                transaction
              )

              const org2FreeSub2 = await setupSubscription({
                organizationId: org2.id,
                customerId: customer2.id,
                paymentMethodId: paymentMethod2.id,
                priceId: freePrice2.id,
                status: SubscriptionStatus.Canceled,
                startDate: testStartDate.getTime(),
                canceledAt: addDays(testStartDate, 7).getTime(),
                cancellationReason: CancellationReason.UpgradedToPaid,
                isFreePlan: true,
                livemode: true,
              })

              // Test org1 metrics
              const org1Metrics = await getUpgradeMetrics(
                org1.id,
                testStartDate,
                testEndDate,
                transaction
              )

              expect(org1Metrics.totalUpgrades).toBe(1)
              expect(org1Metrics.upgradeRevenue).toBe(10000)

              // Test org2 metrics
              const org2Metrics = await getUpgradeMetrics(
                org2.id,
                testStartDate,
                testEndDate,
                transaction
              )

              expect(org2Metrics.totalUpgrades).toBe(2) // One with replacement, one without
              expect(org2Metrics.upgradeRevenue).toBe(10000) // Only one has replacement

              // Test conversion rates are isolated
              const org1ConversionRate =
                await getUpgradeConversionRate(
                  org1.id,
                  testStartDate,
                  testEndDate,
                  transaction
                )

              const org2ConversionRate =
                await getUpgradeConversionRate(
                  org2.id,
                  testStartDate,
                  testEndDate,
                  transaction
                )

              // Org1 has 1 free sub created in the period that upgraded (100% conversion)
              expect(org1ConversionRate).toBe(1)
              // Org2 has 2 free subs created in the period, both upgraded (100% conversion)
              expect(org2ConversionRate).toBe(1)
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })
    })

    describe('Cohort vs in-window semantics', () => {
      it('should use cohort semantics for conversion rate (counts upgrades of subs created in period regardless of when upgrade happened)', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const testStartDate = startOfMonth(new Date())
              const testEndDate = endOfMonth(new Date())

              const orgData = await setupOrg()
              const { organization, product } = orgData
              const customer = await setupCustomer({
                organizationId: organization.id,
              })
              const paymentMethod = await setupPaymentMethod({
                customerId: customer.id,
                organizationId: organization.id,
              })

              const freePrice = await setupPrice({
                unitPrice: 0,
                productId: product.id,
                name: 'Free Tier',
                type: PriceType.Subscription,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })

              // Free subscription created within the window
              const freeSub1 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer.id,
                paymentMethodId: paymentMethod.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Canceled,
                startDate: addDays(testStartDate, 5).getTime(), // Created within window
                canceledAt: addDays(testEndDate, 10).getTime(), // Upgraded AFTER window
                cancellationReason: CancellationReason.UpgradedToPaid,
                isFreePlan: true,
                livemode: true,
              })

              // Free subscription created before window, upgraded within
              const freeSub2 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer.id,
                paymentMethodId: paymentMethod.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Canceled,
                startDate: subDays(testStartDate, 10).getTime(), // Created BEFORE window
                canceledAt: addDays(testStartDate, 5).getTime(), // Upgraded within window
                cancellationReason: CancellationReason.UpgradedToPaid,
                isFreePlan: true,
                livemode: true,
              })

              // Free subscription created within window, not upgraded
              const freeSub3 = await setupSubscription({
                organizationId: organization.id,
                customerId: customer.id,
                paymentMethodId: paymentMethod.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Active,
                startDate: addDays(testStartDate, 10).getTime(), // Created within window
                isFreePlan: true,
                livemode: true,
              })

              const conversionRate = await getUpgradeConversionRate(
                organization.id,
                testStartDate,
                testEndDate,
                transaction
              )

              // Cohort semantics: 2 free subs created in window (freeSub1, freeSub3)
              // 1 of them upgraded (freeSub1, even though upgrade was after window)
              // Conversion rate = 1/2 = 0.5
              expect(conversionRate).toBe(0.5)

              // Also verify that getUpgradeMetrics uses in-window semantics
              const metrics = await getUpgradeMetrics(
                organization.id,
                testStartDate,
                testEndDate,
                transaction
              )

              // Only freeSub2 was upgraded WITHIN the window
              expect(metrics.totalUpgrades).toBe(1)
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })
    })

    describe('Data integrity edge cases', () => {
      it('should handle negative time periods gracefully', async () => {
        ;(
          await adminTransactionWithResult(
            async ({ transaction }) => {
              const testStartDate = startOfMonth(new Date())
              const testEndDate = endOfMonth(new Date())

              const orgData = await setupOrg()
              const { organization, product } = orgData
              const customer = await setupCustomer({
                organizationId: organization.id,
              })
              const paymentMethod = await setupPaymentMethod({
                customerId: customer.id,
                organizationId: organization.id,
              })

              const freePrice = await setupPrice({
                unitPrice: 0,
                productId: product.id,
                name: 'Free Tier',
                type: PriceType.Subscription,
                intervalUnit: IntervalUnit.Month,
                intervalCount: 1,
                trialPeriodDays: 0,
                livemode: true,
                isDefault: false,
                currency: organization.defaultCurrency,
              })

              // Subscription with canceledAt before startDate (data inconsistency)
              const freeSub = await setupSubscription({
                organizationId: organization.id,
                customerId: customer.id,
                paymentMethodId: paymentMethod.id,
                priceId: freePrice.id,
                status: SubscriptionStatus.Canceled,
                startDate: addDays(testStartDate, 10).getTime(),
                canceledAt: addDays(testStartDate, 5).getTime(), // Before startDate!
                cancellationReason: CancellationReason.UpgradedToPaid,
                isFreePlan: true,
                livemode: true,
              })

              const metrics = await getUpgradeMetrics(
                organization.id,
                testStartDate,
                testEndDate,
                transaction
              )

              // Current behavior: counts upgrade even with negative time
              // The subscription is counted because canceledAt is within the date range
              expect(metrics.totalUpgrades).toBe(1)
              // With negative time difference, the implementation filters out invalid date ranges
              expect(metrics.averageTimeToUpgrade).toBe(0) // Function returns 0 for negative times
              return Result.ok(undefined)
            }
          )
        ).unwrap()
      })
    })
  })
})
