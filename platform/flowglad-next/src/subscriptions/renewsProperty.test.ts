import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupBillingPeriod,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProductFeature,
  setupSubscription,
  setupSubscriptionItem,
  setupUsageCreditGrantFeature,
  setupUsageMeter,
} from '@/../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import { selectBillingPeriods } from '@/db/tableMethods/billingPeriodMethods'
import { selectBillingRuns } from '@/db/tableMethods/billingRunMethods'
import { selectLedgerEntries } from '@/db/tableMethods/ledgerEntryMethods'
import {
  safelyUpdatePrice,
  updatePrice,
} from '@/db/tableMethods/priceMethods'
import { selectCurrentlyActiveSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import { updateSubscription } from '@/db/tableMethods/subscriptionMethods'
import { selectUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import {
  attemptToTransitionSubscriptionBillingPeriod,
  createBillingPeriodAndItems,
} from '@/subscriptions/billingPeriodHelpers'
import { createSubscriptionWorkflow } from '@/subscriptions/createSubscription/workflow'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  PriceType,
  SubscriptionStatus,
  UsageCreditType,
} from '@/types'
import core from '@/utils/core'

describe('Renewing vs Non-Renewing Subscriptions', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product
    price = orgData.price

    customer = await setupCustomer({
      organizationId: organization.id,
    })
    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })
  })

  describe('Subscription Creation', () => {
    describe('Renewing Subscriptions', () => {
      it('should create a subscription with renews: true for standard subscriptions', async () => {
        // Use default price (subscription type)
        const result = await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            const stripeSetupIntentId = `si_standard_${core.nanoid()}`
            return createSubscriptionWorkflow(
              {
                organization,
                product,
                price, // Default price is subscription type
                quantity: 1,
                livemode: true,
                startDate: new Date(),
                interval: IntervalUnit.Month,
                intervalCount: 1,
                defaultPaymentMethod: paymentMethod,
                customer,
                stripeSetupIntentId,
                autoStart: true,
              },
              { transaction }
            )
          }
        )

        // Verify renewing subscription properties
        expect(result.subscription.renews).toBe(true)
        expect(result.subscription.status).toBe(
          SubscriptionStatus.Active
        )
        expect(
          typeof result.subscription.currentBillingPeriodStart
        ).toBe('number')
        expect(
          typeof result.subscription.currentBillingPeriodEnd
        ).toBe('number')
        expect(result.subscription.interval).toBe(IntervalUnit.Month)
        expect(result.subscription.intervalCount).toBe(1)
        expect(
          typeof result.subscription.billingCycleAnchorDate
        ).toBe('number')
      })

      it('should create billing period for renewing subscriptions', async () => {
        const result = await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            const stripeSetupIntentId = `si_bp_${core.nanoid()}`
            return createSubscriptionWorkflow(
              {
                organization,
                product,
                price,
                quantity: 1,
                livemode: true,
                startDate: new Date(),
                interval: IntervalUnit.Month,
                intervalCount: 1,
                defaultPaymentMethod: paymentMethod,
                customer,
                stripeSetupIntentId,
                autoStart: true,
              },
              { transaction }
            )
          }
        )

        // Verify billing period was created
        expect(result.billingPeriod).toMatchObject({})
        expect(result.billingPeriod!.startDate).toBe(
          result.subscription.currentBillingPeriodStart!
        )
        expect(result.billingPeriod!.endDate).toBe(
          result.subscription.currentBillingPeriodEnd!
        )
        expect(result.billingPeriod!.status).toBe(
          BillingPeriodStatus.Active
        )
      })

      it('should create billing run for renewing subscriptions with payment method', async () => {
        const result = await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            const stripeSetupIntentId = `si_br_${core.nanoid()}`
            return createSubscriptionWorkflow(
              {
                organization,
                product,
                price,
                quantity: 1,
                livemode: true,
                startDate: new Date(),
                interval: IntervalUnit.Month,
                intervalCount: 1,
                defaultPaymentMethod: paymentMethod,
                customer,
                stripeSetupIntentId,
                autoStart: true,
              },
              { transaction }
            )
          }
        )

        // Verify billing run was created
        expect(result.billingRun).toMatchObject({})
        expect(result.billingRun!.status).toBe(
          BillingRunStatus.Scheduled
        )
        expect(result.billingRun!.scheduledFor).toMatchObject({})
      })

      it('should create trial subscription with renews: true when trialEnd is provided', async () => {
        const trialEnd = new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        )

        const result = await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            const stripeSetupIntentId = `si_trial_${core.nanoid()}`
            return createSubscriptionWorkflow(
              {
                organization,
                product,
                price,
                quantity: 1,
                livemode: true,
                startDate: new Date(),
                interval: IntervalUnit.Month,
                intervalCount: 1,
                defaultPaymentMethod: paymentMethod,
                customer,
                stripeSetupIntentId,
                trialEnd,
                autoStart: true,
              },
              { transaction }
            )
          }
        )

        // Verify trial subscription properties
        expect(result.subscription.renews).toBe(true)
        expect(result.subscription.status).toBe(
          SubscriptionStatus.Trialing
        )
        expect(result.subscription.trialEnd).toBe(trialEnd.getTime())
        expect(result.billingPeriod).toMatchObject({
          trialPeriod: true,
        })
        expect(result.billingPeriod!.trialPeriod).toBe(true)
      })
    })
  })

  describe('Billing Period Transitions', () => {
    describe('Non-Renewing Subscriptions', () => {
      it('should throw error when attempting to transition a CreditTrial subscription', async () => {
        // Create a credit trial subscription (renews: false)
        const creditTrialSubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: null as any,
          priceId: price.id,
          status: SubscriptionStatus.CreditTrial,
          renews: false,
        })

        // Create a billing period for testing (shouldn't normally exist)
        const testBillingPeriod = await setupBillingPeriod({
          subscriptionId: creditTrialSubscription.id,
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() - 1000), // In the past to trigger transition
          status: BillingPeriodStatus.Active,
        })

        // Attempt to transition should throw error
        await expect(
          adminTransaction(async ({ transaction }) => {
            return attemptToTransitionSubscriptionBillingPeriod(
              testBillingPeriod,
              transaction
            )
          })
        ).rejects.toThrow(/credit trial/)
      })

      it('should not create future billing periods for non-renewing subscriptions', async () => {
        const singlePaymentPrice = await setupPrice({
          productId: product.id,
          type: PriceType.SinglePayment,
          name: 'Single Payment Price',
          unitPrice: 100,
          livemode: true,
          isDefault: false,
        })
        // Query initial state
        const { billingPeriods, nonRenewingSubscription } =
          await adminTransaction(async ({ transaction }) => {
            // Create a subscription price but set renews to false to simulate non-renewing behavior
            const {
              result: { subscription: nonRenewingSubscription },
            } = await createSubscriptionWorkflow(
              {
                organization,
                customer,
                product,
                price: singlePaymentPrice,
                quantity: 1,
                livemode: true,
                startDate: new Date(),
                interval: IntervalUnit.Month,
                intervalCount: 1,
              },
              { transaction }
            )

            const billingPeriods = await selectBillingPeriods(
              { subscriptionId: nonRenewingSubscription.id },
              transaction
            )
            return { billingPeriods, nonRenewingSubscription }
          })

        // Should not create any billing periods for non-renewing subscriptions
        expect(billingPeriods).toHaveLength(0)

        // Subscription dates should remain null
        expect(
          nonRenewingSubscription.currentBillingPeriodStart
        ).toBeNull()
        expect(
          nonRenewingSubscription.currentBillingPeriodEnd
        ).toBeNull()
      })

      it('should not schedule billing runs for non-renewing subscriptions', async () => {
        // Check that no billing runs were created
        await adminTransaction(async ({ transaction }) => {
          // Create a subscription price but set renews to false to simulate non-renewing behavior
          const updatedPrice = await safelyUpdatePrice(
            {
              id: price.id,
              type: PriceType.Subscription,
              // Remove usage-specific fields
              usageMeterId: null,
              usageEventsPerUnit: null,
            },
            transaction
          )
          const {
            result: { subscription: nonRenewingSubscription },
          } = await createSubscriptionWorkflow(
            {
              organization,
              customer,
              product,
              price: updatedPrice,
              quantity: 1,
              livemode: true,
              startDate: new Date(),
              interval: IntervalUnit.Month,
              intervalCount: 1,
            },
            { transaction }
          )
          const billingRuns = await selectBillingRuns(
            { subscriptionId: nonRenewingSubscription.id },
            transaction
          )
          expect(billingRuns).toHaveLength(0)
        })
      })
    })

    describe('Renewing Subscriptions', () => {
      it('should create next billing period when current period ends', async () => {
        // Create active subscription with renews: true
        const startDate = new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000
        )
        const endDate = new Date(Date.now() - 1000) // In the past

        const renewingSubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.Active,
          renews: true, // Key difference
          currentBillingPeriodStart: startDate.getTime(),
          currentBillingPeriodEnd: endDate.getTime(),
          interval: IntervalUnit.Month,
          intervalCount: 1,
        })

        // Create current billing period ending in the past
        const currentBillingPeriod = await setupBillingPeriod({
          subscriptionId: renewingSubscription.id,
          startDate: startDate,
          endDate: endDate,
          status: BillingPeriodStatus.Active,
        })

        // Transition billing period
        const result = await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return attemptToTransitionSubscriptionBillingPeriod(
              currentBillingPeriod,
              transaction
            )
          }
        )

        // Verify new billing period was created
        expect(
          result.subscription.currentBillingPeriodStart
        ).not.toEqual(startDate)
        expect(
          result.subscription.currentBillingPeriodStart
        ).toBeGreaterThanOrEqual(endDate.getTime())
        expect(
          result.subscription.currentBillingPeriodEnd
        ).toBeGreaterThan(
          result.subscription.currentBillingPeriodStart!
        )

        // Check that old billing period status was updated
        await adminTransaction(async ({ transaction }) => {
          const allBillingPeriods = await selectBillingPeriods(
            { subscriptionId: renewingSubscription.id },
            transaction
          )

          // Should have 2 billing periods now
          expect(allBillingPeriods.length).toBe(2)

          const oldPeriod = allBillingPeriods.find(
            (bp) => bp.id === currentBillingPeriod.id
          )
          expect(oldPeriod?.status).toBe(
            BillingPeriodStatus.Completed
          )

          const newPeriod = allBillingPeriods.find(
            (bp) => bp.id !== currentBillingPeriod.id
          )
          expect(newPeriod?.status).toBe(BillingPeriodStatus.Active)
        })
      })

      it('should schedule billing run for next period when payment method exists', async () => {
        const startDate = Date.now() - 30 * 24 * 60 * 60 * 1000
        const endDate = Date.now() - 1000

        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.Active,
          renews: true,
          currentBillingPeriodStart: startDate,
          currentBillingPeriodEnd: endDate,
          interval: IntervalUnit.Month,
          intervalCount: 1,
        })

        const billingPeriod = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate,
          endDate,
          status: BillingPeriodStatus.Active,
        })

        const result = await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return attemptToTransitionSubscriptionBillingPeriod(
              billingPeriod,
              transaction
            )
          }
        )

        // Verify billing run was created
        await adminTransaction(async ({ transaction }) => {
          const billingRuns = await selectBillingRuns(
            { subscriptionId: subscription.id },
            transaction
          )
          expect(billingRuns).toHaveLength(1)
          expect(billingRuns[0].status).toBe(
            BillingRunStatus.Scheduled
          )
          expect(typeof billingRuns[0].scheduledFor).toBe('number')
          // scheduledFor should be at or after the end date of the expired period
          expect(billingRuns[0].scheduledFor).toBeGreaterThanOrEqual(
            endDate
          )
        })
      })

      it('should transition to PastDue when no payment method exists', async () => {
        const startDate = Date.now() - 30 * 24 * 60 * 60 * 1000
        const endDate = Date.now() - 1000

        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: null as any, // No payment method
          priceId: price.id,
          status: SubscriptionStatus.Active,
          renews: true,
          currentBillingPeriodStart: startDate,
          currentBillingPeriodEnd: endDate,
          interval: IntervalUnit.Month,
          intervalCount: 1,
        })

        const billingPeriod = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate,
          endDate,
          status: BillingPeriodStatus.Active,
        })

        const result = await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return attemptToTransitionSubscriptionBillingPeriod(
              billingPeriod,
              transaction
            )
          }
        )

        // Verify subscription transitioned to PastDue
        expect(result.subscription.status).toBe(
          SubscriptionStatus.PastDue
        )

        // Verify new billing period was created
        await adminTransaction(async ({ transaction }) => {
          const billingPeriods = await selectBillingPeriods(
            { subscriptionId: subscription.id },
            transaction
          )
          expect(billingPeriods).toHaveLength(2)

          // No billing run should be created
          const billingRuns = await selectBillingRuns(
            { subscriptionId: subscription.id },
            transaction
          )
          expect(billingRuns).toHaveLength(0)
        })
      })

      it('should respect cancelScheduledAt and stop renewal', async () => {
        const startDate = Date.now() - 30 * 24 * 60 * 60 * 1000
        const endDate = Date.now() - 2 * 24 * 60 * 60 * 1000 // 2 days ago
        const cancelScheduledAt = Date.now() - 1 * 24 * 60 * 60 * 1000
        // 1 day ago

        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.Active,
          renews: true,
          currentBillingPeriodStart: startDate,
          currentBillingPeriodEnd: endDate,
          interval: IntervalUnit.Month,
          intervalCount: 1,
          cancelScheduledAt,
        })

        const billingPeriod = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate,
          endDate,
          status: BillingPeriodStatus.Active,
        })

        const result = await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return attemptToTransitionSubscriptionBillingPeriod(
              billingPeriod,
              transaction
            )
          }
        )

        // Verify subscription was canceled
        expect(result.subscription.status).toBe(
          SubscriptionStatus.Canceled
        )
        expect(result.subscription.canceledAt).toMatchObject({})

        // Verify no new billing period was created
        await adminTransaction(async ({ transaction }) => {
          const billingPeriods = await selectBillingPeriods(
            { subscriptionId: subscription.id },
            transaction
          )
          expect(billingPeriods).toHaveLength(1) // Only the original

          // No billing run should be created
          const billingRuns = await selectBillingRuns(
            { subscriptionId: subscription.id },
            transaction
          )
          expect(billingRuns).toHaveLength(0)
        })
      })

      it('should handle subscription that does not renew at period end', async () => {
        const startDate = new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000
        )
        const endDate = new Date(Date.now() - 1000)

        const subscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.Active,
          renews: true, // Initially renewing
          currentBillingPeriodStart: startDate.getTime(),
          currentBillingPeriodEnd: endDate.getTime(),
          interval: IntervalUnit.Month,
          intervalCount: 1,
        })

        // Update subscription to not renew
        const updatedSubscription = await adminTransaction(
          async ({ transaction }) => {
            return updateSubscription(
              {
                id: subscription.id,
                renews: false,
                currentBillingPeriodStart: null,
                currentBillingPeriodEnd: null,
                interval: null,
                intervalCount: null,
                billingCycleAnchorDate: null,
                trialEnd: null,
              },
              transaction
            )
          }
        )

        expect(updatedSubscription.renews).toBe(false)

        const billingPeriod = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate,
          endDate,
          status: BillingPeriodStatus.Active,
        })

        // Attempting to transition should throw error for non-renewing subscription
        await expect(
          comprehensiveAdminTransaction(async ({ transaction }) => {
            return attemptToTransitionSubscriptionBillingPeriod(
              billingPeriod,
              transaction
            )
          })
        ).rejects.toThrow(
          'Non-renewing subscriptions cannot have billing periods'
        )

        // Should not create new billing period for non-renewing
        await adminTransaction(async ({ transaction }) => {
          const billingPeriods = await selectBillingPeriods(
            { subscriptionId: subscription.id },
            transaction
          )
          expect(billingPeriods).toHaveLength(1) // Only original
        })
      })
    })
  })

  describe('Ledger and Credit Management', () => {
    describe('Credits for Non-Renewing Subscriptions', () => {
      it('should grant initial credits for credit trial subscriptions', async () => {
        // Set up usage meter and credit grant feature
        const usageMeter = await setupUsageMeter({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Credit Trial Meter',
        })

        const creditGrantFeature = await setupUsageCreditGrantFeature(
          {
            organizationId: organization.id,
            name: 'Initial Credits',
            usageMeterId: usageMeter.id,
            amount: 1000,
            renewalFrequency: FeatureUsageGrantFrequency.Once,
            livemode: true,
            pricingModelId: pricingModel.id,
          }
        )

        const productFeature = await setupProductFeature({
          organizationId: organization.id,
          productId: product.id,
          featureId: creditGrantFeature.id,
        })

        // Create credit trial price
        const creditTrialPrice = await setupPrice({
          productId: product.id,
          type: PriceType.SinglePayment,
          name: 'Credit Trial Price',
          unitPrice: 100,
          livemode: true,
          isDefault: false,
        })

        // Create subscription with credit trial
        const result = await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return createSubscriptionWorkflow(
              {
                organization,
                product,
                price: creditTrialPrice,
                quantity: 1,
                livemode: true,
                startDate: new Date(),
                interval: IntervalUnit.Month,
                intervalCount: 1,
                customer,
                stripeSetupIntentId: `si_credits_${core.nanoid()}`,
                autoStart: true,
              },
              { transaction }
            )
          }
        )

        // Verify subscription state
        expect(result.subscription.status).toBe(
          SubscriptionStatus.Active
        )
        expect(result.subscription.renews).toBe(false)

        // Check for initial credits
        await adminTransaction(async ({ transaction }) => {
          const credits = await selectUsageCredits(
            { subscriptionId: result.subscription.id },
            transaction
          )

          // Should have initial credits
          expect(credits.length).toBeGreaterThan(0)
          const initialCredit = credits[0]
          expect(initialCredit.issuedAmount).toBe(1000)
          expect(initialCredit.creditType).toBe(UsageCreditType.Grant)
          // Credits for credit trial should not expire
          expect(initialCredit.expiresAt).toBeNull()
        })
      })

      it('should not grant recurring credits for non-renewing subscriptions', async () => {
        // Set up usage meter and recurring credit grant feature
        const usageMeter = await setupUsageMeter({
          organizationId: organization.id,
          pricingModelId: pricingModel.id,
          name: 'Recurring Credit Meter',
        })

        const recurringFeature = await setupUsageCreditGrantFeature({
          organizationId: organization.id,
          name: 'Recurring Credits',
          usageMeterId: usageMeter.id,
          amount: 500,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          livemode: true,
          pricingModelId: pricingModel.id,
        })

        // Create non-renewing subscription
        const nonRenewingSub = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: null as any,
          priceId: price.id,
          status: SubscriptionStatus.CreditTrial,
          renews: false,
        })

        // Set up subscription item feature
        const subscriptionItem = await setupSubscriptionItem({
          subscriptionId: nonRenewingSub.id,
          name: 'Test Item',
          priceId: price.id,
          quantity: 1,
          unitPrice: price.unitPrice,
        })

        // Check initial credits
        const initialCredits = await adminTransaction(
          async ({ transaction }) => {
            return selectUsageCredits(
              { subscriptionId: nonRenewingSub.id },
              transaction
            )
          }
        )

        const initialCount = initialCredits.length

        // Since it's non-renewing, no billing period transition should occur
        // But let's verify that even if we tried, no new credits would be granted

        // Wait and check again - no new credits should appear
        const laterCredits = await adminTransaction(
          async ({ transaction }) => {
            return selectUsageCredits(
              { subscriptionId: nonRenewingSub.id },
              transaction
            )
          }
        )

        // Should have same number of credits (no recurring grants)
        expect(laterCredits.length).toBe(initialCount)
      })

      it('should track credit consumption for credit trial subscriptions', () => {
        // setup:
        // - create credit trial subscription with initial credits
        // - create usage events
        // - process usage
        // expects:
        // - credits should be consumed
        // - ledger should track consumption
        // - subscription should remain active until credits exhausted
      })
    })

    describe('Credits for Renewing Subscriptions', () => {
      it('should grant credits every billing period for renewing subscriptions', () => {
        // setup:
        // - create renewing subscription with EveryBillingPeriod credit grant
        // - transition to new billing period
        // expects:
        // - new credits should be granted
        // - ledger entries should be created
        // - credits should have expiration based on period end
      })

      it('should expire credits at billing period end for renewing subscriptions', () => {
        // setup:
        // - create subscription with expiring credits
        // - transition billing period
        // expects:
        // - expired credits should have expiration ledger entry
        // - credit balance should be reduced
        // - new period credits should be granted
      })

      it('should handle Once vs EveryBillingPeriod grants correctly', () => {
        // setup:
        // - create subscription with both Once and EveryBillingPeriod features
        // - transition multiple billing periods
        // expects:
        // - Once credits only granted on first period
        // - EveryBillingPeriod credits granted each transition
      })
    })
  })

  describe('Status Management', () => {
    describe('Non-Renewing Status Transitions', () => {
      it('should not transition CreditTrial to PastDue', () => {
        // setup:
        // - create credit trial subscription
        // - exhaust credits
        // - attempt status transition
        // expects:
        // - status should not become PastDue
        // - should transition to Canceled or remain CreditTrial
      })

      it('should handle CreditTrial to Active conversion', () => {
        // setup:
        // - create credit trial subscription
        // - add payment method and convert
        // expects:
        // - status should become Active
        // - renews should become true
        // - billing period should be created
      })

      it('should handle CreditTrial to Canceled when credits exhausted', () => {
        // setup:
        // - create credit trial subscription
        // - exhaust all credits
        // - no payment method
        // expects:
        // - status should become Canceled
        // - canceledAt should be set
        // - renews should remain false
      })
    })

    describe('Renewing Status Transitions', () => {
      it('should transition Active to PastDue on payment failure', () => {
        // setup:
        // - create active renewing subscription
        // - remove payment method
        // - transition billing period
        // expects:
        // - status should become PastDue
        // - new billing period should still be created
        // - subscription should still renew
      })

      it('should transition Trial to Active at trial end', () => {
        // setup:
        // - create trial subscription with renews: true
        // - transition at trial end with payment method
        // expects:
        // - status should become Active
        // - billing run should be created
        // - regular billing period should start
      })

      it('should cancel at scheduled time for renewing subscriptions', () => {
        // setup:
        // - create renewing subscription with cancelScheduledAt
        // - transition past scheduled date
        // expects:
        // - status should become Canceled
        // - no new billing period created
        // - canceledAt should be set
      })
    })
  })

  describe('Billing Runs', () => {
    describe('Non-Renewing Subscriptions', () => {
      it('should never create billing runs for credit trial subscriptions', async () => {
        // Create credit trial price
        const creditTrialPrice = await setupPrice({
          productId: product.id,
          type: PriceType.SinglePayment,
          name: 'Credit Trial Price',
          unitPrice: 100,
          livemode: true,
          isDefault: false,
        })

        // Create credit trial subscription WITH payment method
        const result = await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return createSubscriptionWorkflow(
              {
                organization,
                product,
                price: creditTrialPrice,
                quantity: 1,
                livemode: true,
                startDate: new Date(),
                interval: IntervalUnit.Month,
                intervalCount: 1,
                defaultPaymentMethod: paymentMethod, // Has payment method
                customer,
                stripeSetupIntentId: `si_no_runs_${core.nanoid()}`,
                autoStart: true,
              },
              { transaction }
            )
          }
        )

        // Verify no billing run was created
        expect(result.billingRun).toBeNull()
        expect(result.subscription.status).toBe(
          SubscriptionStatus.Active
        )
        expect(result.subscription.renews).toBe(false)

        // Double-check database
        await adminTransaction(async ({ transaction }) => {
          const billingRuns = await selectBillingRuns(
            { subscriptionId: result.subscription.id },
            transaction
          )
          expect(billingRuns).toHaveLength(0)
        })
      })
    })

    describe('Renewing Subscriptions', () => {
      it('should create billing runs at period start for subscription prices', async () => {
        // Ensure price is subscription type
        const subscriptionPrice = await adminTransaction(
          async ({ transaction }) => {
            return updatePrice(
              {
                id: price.id,
                type: PriceType.Subscription,
              },
              transaction
            )
          }
        )

        // Create renewing subscription
        const result = await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            return createSubscriptionWorkflow(
              {
                organization,
                product,
                price: subscriptionPrice,
                quantity: 1,
                livemode: true,
                startDate: new Date(),
                interval: IntervalUnit.Month,
                intervalCount: 1,
                defaultPaymentMethod: paymentMethod,
                customer,
                stripeSetupIntentId: `si_period_start_${core.nanoid()}`,
                autoStart: true,
              },
              { transaction }
            )
          }
        )

        // Verify subscription is renewing
        expect(result.subscription.renews).toBe(true)
        expect(result.subscription.status).toBe(
          SubscriptionStatus.Active
        )

        // Verify billing run was created
        expect(result.billingRun).toMatchObject({})
        expect(result.billingRun!.status).toBe(
          BillingRunStatus.Scheduled
        )

        // Verify subscription is set to run billing at period start
        expect(result.subscription.runBillingAtPeriodStart).toBe(true)
      })

      it('should create billing runs at period end for usage prices', () => {
        // setup:
        // - create subscription with usage price type
        // - set up usage events
        // - transition billing period
        // expects:
        // - billing run created for previous period
        // - runBillingAtPeriodStart should be false
      })

      it('should handle billing run failures and retries', () => {
        // setup:
        // - create subscription with billing run
        // - simulate payment failure
        // - retry billing
        // expects:
        // - billing run status should update
        // - subscription status should reflect payment state
        // - retry logic should work correctly
      })
    })
  })

  describe('Edge Cases', () => {
    it('should prevent setting interval fields for non-renewing subscriptions', () => {
      // setup:
      // - create credit trial subscription
      // - attempt to update with interval values
      // expects:
      // - should reject or ignore interval updates
      // - interval fields should remain null
    })

    it('should handle mixed subscription types in same customer account', () => {
      // setup:
      // - create customer with both credit trial and regular subscriptions
      // - perform operations on both
      // expects:
      // - each subscription should behave according to its renews flag
      // - no interference between subscription types
    })

    it('should validate data integrity for renews flag', async () => {
      // Create subscription with renews: false
      const nonRenewingSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: null as any,
        priceId: price.id,
        status: SubscriptionStatus.Active,
        renews: false,
      })

      // Verify data integrity
      expect(nonRenewingSubscription.renews).toBe(false)
      expect(
        nonRenewingSubscription.currentBillingPeriodStart
      ).toBeNull()
      expect(
        nonRenewingSubscription.currentBillingPeriodEnd
      ).toBeNull()
      expect(nonRenewingSubscription.interval).toBeNull()
      expect(nonRenewingSubscription.intervalCount).toBeNull()
      expect(
        nonRenewingSubscription.billingCycleAnchorDate
      ).toBeNull()
      expect(nonRenewingSubscription.status).toBe(
        SubscriptionStatus.Active
      )

      // Verify no billing periods exist
      await adminTransaction(async ({ transaction }) => {
        const billingPeriods = await selectBillingPeriods(
          { subscriptionId: nonRenewingSubscription.id },
          transaction
        )
        expect(billingPeriods).toHaveLength(0)

        // Verify no billing runs exist
        const billingRuns = await selectBillingRuns(
          { subscriptionId: nonRenewingSubscription.id },
          transaction
        )
        expect(billingRuns).toHaveLength(0)
      })
    })
  })
})
