import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupPrice,
  setupProduct,
  setupBillingPeriod,
  setupBillingPeriodItem,
} from '@/../seedDatabase'
import {
  CancellationReason,
  SubscriptionStatus,
  PaymentMethodType,
  PriceType,
  IntervalUnit,
} from '@/types'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { Customer } from '@/db/schema/customers'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { core } from '@/utils/core'
import { updateSubscription } from '@/db/tableMethods/subscriptionMethods'
import { calculateSubscriberBreakdown } from './subscriberCalculationHelpers'
import { calculateMRRBreakdown } from './revenueCalculationHelpers'
import {
  getUpgradeMetrics,
  getUpgradeConversionRate,
  getUpgradePaths,
} from './upgradeMetrics'
import {
  startOfMonth,
  endOfMonth,
  addDays,
  subMonths,
} from 'date-fns'
import { subscriptions } from '@/db/schema/subscriptions'
import { eq } from 'drizzle-orm'

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
      setupFeeAmount: 0,
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
        await adminTransaction(async ({ transaction }) => {
          const previousMonth = subMonths(new Date(), 1)
          const currentMonth = new Date()

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
              cancellationReason: CancellationReason.UpgradedToPaid,
              renews: freeSub1.renews,
            },
            transaction
          )

          await updateSubscription(
            {
              id: freeSub2.id,
              status: SubscriptionStatus.Canceled,
              canceledAt: currentMonth,
              cancellationReason: CancellationReason.UpgradedToPaid,
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
              cancellationReason: CancellationReason.CustomerRequest,
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
        })
      })

      it('should correctly count new subscribers regardless of upgrade status', () => {
        // setup:
        // - create organization and basic setup
        // - in current month: create 2 new free subscriptions
        // - in current month: create 1 new paid subscription (not an upgrade)
        // expects:
        // - newSubscribers should be 3
        // - all new subscriptions should be counted
      })

      it('should handle mixed cancellation reasons correctly', () => {
        // setup:
        // - create organization and basic setup
        // - create 4 subscriptions in previous month
        // - cancel with different reasons:
        //   - 1 with upgraded_to_paid
        //   - 1 with customer_request
        //   - 1 with non_payment
        //   - 1 with other
        // expects:
        // - churned should be 3 (all except upgraded_to_paid)
        // - only upgraded_to_paid should be excluded from churn
      })
    })
  })

  describe('revenueCalculationHelpers', () => {
    describe('calculateMRRBreakdown', () => {
      it('should track upgrade MRR separately from new MRR', async () => {
        await adminTransaction(async ({ transaction }) => {
          const previousMonth = subMonths(new Date(), 1)
          const currentMonth = new Date()

          // Create higher price tier for testing
          const paidPrice = await setupPrice({
            productId: product.id,
            name: 'Paid Tier',
            type: PriceType.Subscription,
            unitPrice: 10000, // $100/month in cents
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            setupFeeAmount: 0,
            currency: organization.defaultCurrency,
          })

          const basicPrice = await setupPrice({
            productId: product.id,
            name: 'Basic Tier',
            type: PriceType.Subscription,
            unitPrice: 5000, // $50/month in cents
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            isDefault: false,
            setupFeeAmount: 0,
            currency: organization.defaultCurrency,
          })

          // Previous month: create 2 free subscriptions
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

          // Set up billing periods for previous month
          await setupBillingPeriod({
            subscriptionId: freeSub1.id,
            startDate: startOfMonth(previousMonth),
            endDate: endOfMonth(previousMonth),
            livemode: true,
          })

          await setupBillingPeriod({
            subscriptionId: freeSub2.id,
            startDate: startOfMonth(previousMonth),
            endDate: endOfMonth(previousMonth),
            livemode: true,
          })

          // Current month: upgrade 1 free to paid
          await updateSubscription(
            {
              id: freeSub1.id,
              status: SubscriptionStatus.Canceled,
              canceledAt: currentMonth,
              cancellationReason: CancellationReason.UpgradedToPaid,
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
            startDate: currentMonth,
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
            startDate: currentMonth,
            livemode: true,
          })

          // Set up billing periods for current month with items
          const [upgradedBp, newPaidBp, freeSub2Bp] =
            await Promise.all([
              setupBillingPeriod({
                subscriptionId: upgradedSub.id,
                startDate: startOfMonth(currentMonth),
                endDate: endOfMonth(currentMonth),
                livemode: true,
              }),
              setupBillingPeriod({
                subscriptionId: newPaidSub.id,
                startDate: startOfMonth(currentMonth),
                endDate: endOfMonth(currentMonth),
                livemode: true,
              }),
              setupBillingPeriod({
                subscriptionId: freeSub2.id,
                startDate: startOfMonth(currentMonth),
                endDate: endOfMonth(currentMonth),
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
        })
      })

      it('should not count upgraded subscriptions in churn MRR', () => {
        // setup:
        // - create organization with paid products
        // - previous month: create 3 paid subscriptions ($100/month each)
        // - current month:
        //   - upgrade 1 to higher tier (cancel old, create new)
        //   - cancel 1 normally (customer_request)
        //   - keep 1 active
        // expects:
        // - churnMRR should be 100 (only the normally canceled one)
        // - upgradeMRR should track the upgraded subscription's new value
        // - the upgraded subscription should NOT appear in churnMRR
      })

      it('should correctly calculate net MRR with all components', () => {
        // setup:
        // - create organization with multiple price tiers
        // - previous month: mix of free and paid subscriptions
        // - current month changes:
        //   - new subscriptions
        //   - upgrades from free to paid
        //   - expansions (same sub, higher price)
        //   - contractions (same sub, lower price)
        //   - normal churn
        // expects:
        // - netMRR = newMRR + expansionMRR + upgradeMRR - contractionMRR - churnMRR
        // - each component calculated correctly
        // - upgradeMRR separate from expansionMRR
      })

      it('should handle upgrade chains correctly', () => {
        // setup:
        // - create free subscription in month 1
        // - upgrade to basic in month 2
        // - upgrade to premium in month 3
        // - calculate MRR breakdown between month 2 and 3
        // expects:
        // - upgradeMRR should reflect basic to premium upgrade
        // - no double counting of upgrades
        // - replacedBySubscriptionId chain followed correctly
      })
    })
  })

  describe('upgradeMetrics', () => {
    describe('getUpgradeMetrics', () => {
      it('should count total upgrades within date range', async () => {
        await adminTransaction(async ({ transaction }) => {
          const testStartDate = startOfMonth(new Date())
          const testEndDate = endOfMonth(new Date())
          const beforeRange = subMonths(testStartDate, 2)
          const afterRange = addDays(testEndDate, 10)

          // Create 5 free subscriptions
          const subs = await Promise.all([
            setupSubscription({
              organizationId: organization.id,
              customerId: customer1.id,
              paymentMethodId: paymentMethod1.id,
              priceId: freePrice.id,
              status: SubscriptionStatus.Canceled,
              startDate: subMonths(new Date(), 3),
              canceledAt: addDays(testStartDate, 5), // Within range
              cancellationReason: CancellationReason.UpgradedToPaid,
              isFreePlan: true,
              livemode: true,
            }),
            setupSubscription({
              organizationId: organization.id,
              customerId: customer2.id,
              paymentMethodId: paymentMethod2.id,
              priceId: freePrice.id,
              status: SubscriptionStatus.Canceled,
              startDate: subMonths(new Date(), 3),
              canceledAt: addDays(testStartDate, 10), // Within range
              cancellationReason: CancellationReason.UpgradedToPaid,
              isFreePlan: true,
              livemode: true,
            }),
            setupSubscription({
              organizationId: organization.id,
              customerId: customer3.id,
              paymentMethodId: paymentMethod3.id,
              priceId: freePrice.id,
              status: SubscriptionStatus.Canceled,
              startDate: subMonths(new Date(), 3),
              canceledAt: addDays(testStartDate, 15), // Within range
              cancellationReason: CancellationReason.UpgradedToPaid,
              isFreePlan: true,
              livemode: true,
            }),
            setupSubscription({
              organizationId: organization.id,
              customerId: customer1.id,
              paymentMethodId: paymentMethod1.id,
              priceId: freePrice.id,
              status: SubscriptionStatus.Canceled,
              startDate: subMonths(new Date(), 4),
              canceledAt: beforeRange, // Before range
              cancellationReason: CancellationReason.UpgradedToPaid,
              isFreePlan: true,
              livemode: true,
            }),
            setupSubscription({
              organizationId: organization.id,
              customerId: customer2.id,
              paymentMethodId: paymentMethod2.id,
              priceId: freePrice.id,
              status: SubscriptionStatus.Canceled,
              startDate: subMonths(new Date(), 2),
              canceledAt: afterRange, // After range
              cancellationReason: CancellationReason.UpgradedToPaid,
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
        })
      })

      it('should calculate average time to upgrade correctly', () => {
        // setup:
        // - create organization
        // - create 3 free subscriptions
        // - upgrade after different periods:
        //   - subscription 1: after 10 days
        //   - subscription 2: after 20 days
        //   - subscription 3: after 30 days
        // expects:
        // - averageTimeToUpgrade should be 20 days
        // - calculation: (10 + 20 + 30) / 3 = 20
      })

      it('should return empty metrics when no upgrades exist', () => {
        // setup:
        // - create organization
        // - create several free subscriptions
        // - do not upgrade any of them
        // expects:
        // - totalUpgrades should be 0
        // - averageTimeToUpgrade should be 0
        // - upgradeRevenue should be 0
        // - upgradedSubscriptions should be empty array
      })

      it('should calculate upgrade revenue correctly', () => {
        // setup:
        // - create organization with various price points
        // - upgrade 3 free subscriptions to different paid tiers:
        //   - free to $50/month
        //   - free to $100/month
        //   - free to $200/month
        // expects:
        // - upgradeRevenue should reflect the new subscription values
        // - should follow replacedBySubscriptionId to find new subscriptions
      })
    })

    describe('getUpgradeConversionRate', () => {
      it('should calculate conversion rate as upgraded/total', async () => {
        await adminTransaction(async ({ transaction }) => {
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
              startDate: addDays(testStartDate, i),
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
                  canceledAt: addDays(testStartDate, 15),
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
        })
      })

      it('should return 0 when no free subscriptions exist', () => {
        // setup:
        // - create organization
        // - create only paid subscriptions (no free)
        // expects:
        // - conversion rate should be 0
        // - no division by zero error
      })

      it('should only count free subscriptions created in date range', () => {
        // setup:
        // - create organization
        // - create 5 free subscriptions before date range
        // - create 5 free subscriptions within date range
        // - upgrade 2 from each group
        // expects:
        // - should only consider the 5 created within date range
        // - conversion rate should be based on those 5 only
      })
    })

    describe('getUpgradePaths', () => {
      it('should track single upgrade path correctly', () => {
        // setup:
        // - create organization
        // - create free subscription
        // - upgrade to paid subscription
        // - link with replacedBySubscriptionId
        // expects:
        // - returns array with one upgrade path
        // - fromSubscription should be the free subscription
        // - toSubscription should be the paid subscription
        // - linked via replacedBySubscriptionId
      })

      it('should handle missing replacement subscription gracefully', () => {
        // setup:
        // - create organization
        // - create free subscription
        // - mark as upgraded but don't create replacement
        // - (simulates data inconsistency)
        // expects:
        // - returns fromSubscription with null toSubscription
        // - no errors thrown
        // - handles orphaned upgrades gracefully
      })

      it('should track multiple upgrade paths', () => {
        // setup:
        // - create organization
        // - create multiple upgrade scenarios:
        //   - free1 → basic1
        //   - free2 → premium1
        //   - free3 → basic2 → premium2 (upgrade chain)
        // expects:
        // - returns all upgrade paths
        // - each path has correct from and to subscriptions
        // - chains handled correctly
      })
    })
  })

  describe('Integration Tests', () => {
    it('should handle full upgrade flow with all analytics updated', async () => {
      await adminTransaction(async ({ transaction }) => {
        const previousMonth = subMonths(new Date(), 1)
        const currentMonth = new Date()

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
          setupFeeAmount: 0,
          currency: organization.defaultCurrency,
        })

        // Create free subscription in previous month
        const freeSub = await setupSubscription({
          organizationId: organization.id,
          customerId: customer1.id,
          paymentMethodId: paymentMethod1.id,
          priceId: freePrice.id,
          status: SubscriptionStatus.Active,
          startDate: previousMonth,
          isFreePlan: true,
          livemode: true,
        })

        // Simulate upgrade process
        await updateSubscription(
          {
            id: freeSub.id,
            status: SubscriptionStatus.Canceled,
            canceledAt: currentMonth,
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
          startDate: currentMonth,
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
          startDate: startOfMonth(previousMonth),
          endDate: endOfMonth(previousMonth),
          livemode: true,
        })

        const paidBp = await setupBillingPeriod({
          subscriptionId: paidSub.id,
          startDate: startOfMonth(currentMonth),
          endDate: endOfMonth(currentMonth),
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
            currentMonth,
            previousMonth,
            transaction
          )
        expect(subscriberBreakdown.churned).toBe(0) // Upgrade not counted as churn

        // Verify upgrade metrics include the upgrade
        const upgradeMetrics = await getUpgradeMetrics(
          organization.id,
          startOfMonth(currentMonth),
          endOfMonth(currentMonth),
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
      })
    })

    it('should prevent multiple active free subscriptions per customer', () => {
      // setup:
      // - create organization with multiple free products
      // - create customer with one free subscription
      // - attempt to create second free subscription
      // expects:
      // - second free subscription creation should fail
      // - error message about existing free subscription
      // - first subscription remains active
    })

    it('should handle upgrade race conditions correctly', () => {
      // setup:
      // - create organization
      // - create customer with free subscription
      // - simulate concurrent upgrade attempts
      // expects:
      // - only one upgrade succeeds
      // - no duplicate paid subscriptions
      // - database constraints prevent issues
    })
  })
})
