import { beforeEach, describe, expect, it } from 'bun:test'
import { Result } from 'better-result'
import {
  setupBillingPeriod,
  setupBillingPeriodItem,
  setupBillingRun,
  setupCustomer,
  setupInvoice,
  setupLedgerAccount,
  setupLedgerEntries,
  setupLedgerTransaction,
  setupOrg,
  setupPayment,
  setupPaymentMethod,
  setupProductFeature,
  setupResource,
  setupResourceClaim,
  setupResourceFeature,
  setupResourceSubscriptionItemFeature,
  setupSubscription,
  setupSubscriptionItem,
  setupSubscriptionItemFeature,
  setupUsageCredit,
  setupUsageCreditApplication,
  setupUsageCreditGrantFeature,
  setupUsageEvent,
  setupUsageLedgerScenario,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { BillingRun } from '@/db/schema/billingRuns'
import type { Customer } from '@/db/schema/customers'
import type { LedgerAccount } from '@/db/schema/ledgerAccounts'
import type { LedgerEntry } from '@/db/schema/ledgerEntries'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import type { UsageMeter } from '@/db/schema/usageMeters'
import {
  selectBillingPeriods,
  updateBillingPeriod,
} from '@/db/tableMethods/billingPeriodMethods'
import {
  aggregateBalanceForLedgerAccountFromEntries,
  selectLedgerEntries,
} from '@/db/tableMethods/ledgerEntryMethods'
import { selectResourceClaims } from '@/db/tableMethods/resourceClaimMethods'
import { insertSubscriptionItem } from '@/db/tableMethods/subscriptionItemMethods'
import {
  safelyUpdateSubscriptionStatus,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import { selectUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import {
  attemptToTransitionSubscriptionBillingPeriod,
  billingPeriodAndItemsInsertsFromSubscription,
  createBillingPeriodAndItems,
} from '@/subscriptions/billingPeriodHelpers'
import {
  createCapturingEffectsContext,
  createDiscardingEffectsContext,
  createProcessingEffectsContext,
} from '@/test-utils/transactionCallbacks'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  FeatureType,
  FeatureUsageGrantFrequency,
  InvoiceStatus,
  LedgerEntryType,
  LedgerTransactionType,
  PaymentStatus,
  SubscriptionItemType,
  SubscriptionStatus,
  UsageCreditType,
} from '@/types'
import core from '@/utils/core'

let customer: Customer.Record
let paymentMethod: PaymentMethod.Record
let billingPeriod: BillingPeriod.Record
let billingRun: BillingRun.Record
let subscription: Subscription.StandardRecord
let usageMeter: UsageMeter.Record
let otherUsageMeter: UsageMeter.Record
let ledgerAccount: LedgerAccount.Record
let otherLedgerAccount: LedgerAccount.Record
let subscriptionItem: SubscriptionItem.Record
let organization: Organization.Record
let pricingModel: PricingModel.Record
let price: Price.Record
let product: Product.Record

describe('Subscription Billing Period Transition', async () => {
  const { organization, price, product, pricingModel } = (
    await setupOrg()
  ).unwrap()

  beforeEach(async () => {
    customer = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    paymentMethod = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
    ).unwrap()

    subscription = (await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      paymentMethodId: paymentMethod.id,
      currentBillingPeriodEnd: Date.now() - 3000,
      currentBillingPeriodStart:
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      renews: true,
    })) as Subscription.StandardRecord
    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: subscription.currentBillingPeriodStart!,
      endDate: subscription.currentBillingPeriodEnd!,
      status: BillingPeriodStatus.Active,
    })
    billingRun = await setupBillingRun({
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
  })

  // Test 1: When the current billing period is already terminal (e.g. Completed)…
  it('should create a new future billing period and billing run when current billing period is terminal and subscription is active', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Mark the current billing period as terminal (Completed)
      const updatedBillingPeriod = await updateBillingPeriod(
        {
          id: billingPeriod.id,
          status: BillingPeriodStatus.Completed,
        },
        transaction
      )
      // Call the transition function
      const { subscription: updatedSub, billingRun: newBillingRun } =
        (
          await attemptToTransitionSubscriptionBillingPeriod(
            updatedBillingPeriod,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

      // Expect that the subscription's current billing period dates are updated (i.e. a new period was created)
      expect(updatedSub.currentBillingPeriodStart).not.toEqual(
        updatedBillingPeriod.startDate
      )
      // And because a valid payment method exists, a billing run should be created
      expect(typeof newBillingRun).toBe('object')
      return Result.ok(undefined)
    })
  })

  // Test 2: Billing period endDate in the future should return an error Result
  it('should return Result.err if the billing period endDate is in the future', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Create a copy of billingPeriod with an endDate in the future
      const futureBillingPeriod = {
        ...billingPeriod,
        endDate: Date.now() + 24 * 60 * 60 * 1000,
      }
      const result =
        await attemptToTransitionSubscriptionBillingPeriod(
          futureBillingPeriod,
          createDiscardingEffectsContext(transaction)
        )

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toMatch(
          /Cannot close billing period/
        )
      }
      return Result.ok(undefined)
    })
  })

  // Test 3: When payment totals fully cover the billing period, mark it as Completed
  it('should mark the current billing period as Completed if fully paid', async () => {
    const invoice = (
      await setupInvoice({
        billingPeriodId: billingPeriod.id,
        status: InvoiceStatus.Paid,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: price.id,
      })
    ).unwrap()
    await setupPayment({
      billingPeriodId: billingPeriod.id,
      organizationId: organization.id,
      customerId: customer.id,
      stripeChargeId: `ch_123_${core.nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 100,
      invoiceId: invoice.id,
    })
    // Create a paid invoice for the billing period (simulate full payment)
    await adminTransaction(async ({ transaction }) => {
      // Set the billing period endDate in the past so closure logic runs
      const { subscription: updatedSub } = (
        await attemptToTransitionSubscriptionBillingPeriod(
          billingPeriod,
          createDiscardingEffectsContext(transaction)
        )
      ).unwrap()

      // Verify that the current (old) billing period is now Completed
      const allBPeriods = await selectBillingPeriods(
        { subscriptionId: subscription.id },
        transaction
      )
      const currentBp = allBPeriods.find(
        (bp) => bp.id === billingPeriod.id
      )
      expect(currentBp?.status).toBe(BillingPeriodStatus.Completed)

      // And a new billing period was created (its dates differ from the old one)
      expect(updatedSub.currentBillingPeriodStart).not.toEqual(
        billingPeriod.startDate
      )
      return Result.ok(undefined)
    })
  })

  // Test 4: If the subscription is in a terminal state, no future billing period should be created.
  it('should return early if the subscription is in a terminal state', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Mark subscription as terminal (Canceled)
      await safelyUpdateSubscriptionStatus(
        subscription,
        SubscriptionStatus.Canceled,
        transaction
      )
      const { subscription: updatedSub, billingRun: newBillingRun } =
        (
          await attemptToTransitionSubscriptionBillingPeriod(
            billingPeriod,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

      expect(newBillingRun).toBeNull()
      expect(updatedSub.status).toBe(SubscriptionStatus.Canceled)
      return Result.ok(undefined)
    })
  })

  //   // Test 5: If subscription.cancelScheduledAt is in the past, cancel the subscription.
  it('should cancel the subscription if cancelScheduledAt is in the past', async () => {
    await adminTransaction(async ({ transaction }) => {
      const pastDate = Date.now() - 1000
      subscription.cancelScheduledAt = pastDate
      await updateSubscription(
        {
          id: subscription.id,
          cancelScheduledAt: pastDate,
          status: SubscriptionStatus.Active,
          renews: subscription.renews,
        },
        transaction
      )
      const updatedBillingPeriod = await updateBillingPeriod(
        { id: billingPeriod.id, endDate: pastDate },
        transaction
      )

      const { subscription: updatedSub, billingRun: newBillingRun } =
        (
          await attemptToTransitionSubscriptionBillingPeriod(
            updatedBillingPeriod,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

      expect(updatedSub.status).toBe(SubscriptionStatus.Canceled)
      expect(typeof updatedSub.canceledAt).toBe('number')
      expect(updatedSub.canceledAt).toBeGreaterThan(0)
      expect(newBillingRun).toBeNull()
      return Result.ok(undefined)
    })
  })

  // Test 6: Normal transition when subscription is active with a valid payment method.
  it('should create a new active billing period and billing run for active subscription with valid payment method', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Ensure the current billing period has already ended
      const updatedBillingPeriod = await updateBillingPeriod(
        {
          id: billingPeriod.id,
          endDate: Date.now() - 1000,
        },
        transaction
      )

      const { subscription: updatedSub, billingRun: newBillingRun } =
        (
          await attemptToTransitionSubscriptionBillingPeriod(
            updatedBillingPeriod,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

      // Verify that subscription billing period dates have been updated to new period values
      expect(updatedSub.currentBillingPeriodStart).not.toEqual(
        updatedBillingPeriod.startDate
      )
      expect(typeof updatedSub.currentBillingPeriodEnd).toBe('number')
      expect(updatedSub.currentBillingPeriodEnd).toBeGreaterThan(
        Date.now()
      )
      // And a billing run was created with scheduledFor equal to the new period's start date
      expect(typeof newBillingRun).toBe('object')
      expect(newBillingRun?.scheduledFor).toEqual(
        updatedSub.currentBillingPeriodStart!
      )
      return Result.ok(undefined)
    })
  })

  // Test 7: Transition when no payment method is available.
  it('should create a new active billing period but set subscription to PastDue when no payment method exists', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Remove payment method(s) from subscription
      subscription.defaultPaymentMethodId = null
      subscription.backupPaymentMethodId = null
      await updateSubscription(
        {
          id: subscription.id,
          defaultPaymentMethodId: null,
          backupPaymentMethodId: null,
          status: SubscriptionStatus.Active,
          renews: subscription.renews,
        },
        transaction
      )
      // Ensure current billing period endDate is in the past
      const updatedBillingPeriod = await updateBillingPeriod(
        {
          id: billingPeriod.id,
          endDate: Date.now() - 1000,
        },
        transaction
      )

      const { subscription: updatedSub, billingRun: newBillingRun } =
        (
          await attemptToTransitionSubscriptionBillingPeriod(
            updatedBillingPeriod,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

      // Expect no billing run is created and subscription status is updated to PastDue
      expect(newBillingRun).toBeNull()
      expect(updatedSub.status).toBe(SubscriptionStatus.PastDue)
      expect(updatedSub.currentBillingPeriodStart).not.toEqual(
        billingPeriod.startDate
      )
      return Result.ok(undefined)
    })
  })

  // Test 8: No new future billing period should be created when subscription.cancelScheduledAt >= last billing period end.
  it('should not create a new billing period if subscription.cancelScheduledAt is set and >= current billing period end date', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Set subscription.cancelScheduledAt to just after the current billing period end
      const futureEnd = new Date(billingPeriod.endDate + 50000)
      subscription.cancelScheduledAt = futureEnd.getTime()
      await updateSubscription(
        {
          id: subscription.id,
          cancelScheduledAt: futureEnd.getTime(),
          status: SubscriptionStatus.Active,
          renews: subscription.renews,
        },
        transaction
      )

      // Ensure current billing period is closed (endDate in past)
      const updatedBillingPeriod = await updateBillingPeriod(
        {
          id: billingPeriod.id,
          endDate: Date.now() - 1000,
        },
        transaction
      )
      const { subscription: updatedSub, billingRun: newBillingRun } =
        (
          await attemptToTransitionSubscriptionBillingPeriod(
            updatedBillingPeriod,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

      // Since attemptToCreateFutureBillingPeriodForSubscription returns null,
      // billingRun remains null and subscription status is set to PastDue.
      expect(newBillingRun).toBeNull()
      expect(updatedSub.status).toBe(SubscriptionStatus.PastDue)
      // The subscription's current billing period dates should remain unchanged.
      expect(updatedSub.currentBillingPeriodStart).toEqual(
        subscription.currentBillingPeriodStart
      )
      expect(updatedSub.currentBillingPeriodEnd).toEqual(
        subscription.currentBillingPeriodEnd
      )
      return Result.ok(undefined)
    })
  })

  // Test 12: Edge-case when billing period payment totals exactly match billing item total.
  it('should mark the billing period as Completed when total due exactly equals total paid', async () => {
    // Simulate full payment by creating a paid invoice
    const invoice = (
      await setupInvoice({
        billingPeriodId: billingPeriod.id,
        status: InvoiceStatus.Paid,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: price.id,
      })
    ).unwrap()

    await setupPayment({
      billingPeriodId: billingPeriod.id,
      organizationId: organization.id,
      customerId: customer.id,
      stripeChargeId: `ch_123_${core.nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 100,
      invoiceId: invoice.id,
    })
    await adminTransaction(async ({ transaction }) => {
      const updatedBillingPeriod = await updateBillingPeriod(
        {
          id: billingPeriod.id,
          endDate: Date.now() - 1000,
        },
        transaction
      )
      const { subscription: updatedSub, updatedBillingPeriod: uBP } =
        (
          await attemptToTransitionSubscriptionBillingPeriod(
            updatedBillingPeriod,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()
      const allBPeriods = await selectBillingPeriods(
        { subscriptionId: subscription.id },
        transaction
      )
      const currentBp = allBPeriods.find(
        (bp) => bp.id === billingPeriod.id
      )
      expect(currentBp?.status).toBe(BillingPeriodStatus.Completed)
      return Result.ok(undefined)
    })
  })

  // Test 13: When required billing period data is missing (e.g. endDate), return an error Result.
  it('should return Result.err when billing period endDate is missing', async () => {
    await adminTransaction(async ({ transaction }) => {
      const invalidBillingPeriod = {
        ...billingPeriod,
        endDate: null,
      }
      const result =
        await attemptToTransitionSubscriptionBillingPeriod(
          invalidBillingPeriod as unknown as BillingPeriod.Record,
          createDiscardingEffectsContext(transaction)
        )

      expect(Result.isError(result)).toBe(true)
      return Result.ok(undefined)
    })
  })

  it('should create a new future billing period and billing run when current billing period is terminal and subscription is active', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Mark the current billing period as terminal (Completed)
      const updatedBillingPeriod = await updateBillingPeriod(
        {
          id: billingPeriod.id,
          status: BillingPeriodStatus.Completed,
        },
        transaction
      )
      // Call the transition function
      const { subscription: updatedSub, billingRun: newBillingRun } =
        (
          await attemptToTransitionSubscriptionBillingPeriod(
            updatedBillingPeriod,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()
      // Expect that the subscription's current billing period dates are updated.
      expect(updatedSub.currentBillingPeriodStart).not.toEqual(
        updatedBillingPeriod.startDate
      )
      // And because a valid payment method exists, a billing run should be created.
      expect(typeof newBillingRun).toBe('object')
      return Result.ok(undefined)
    })
  })

  it('calls enqueueLedgerCommand with BillingPeriodTransitionLedgerCommand when transitioning to a new billing period', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Mark the current billing period as completed (terminal state)
      const completedBillingPeriod = await updateBillingPeriod(
        {
          id: billingPeriod.id,
          status: BillingPeriodStatus.Completed,
        },
        transaction
      )

      // Create a capturing context to verify the ledger command
      const { ctx, effects } =
        createCapturingEffectsContext(transaction)

      // Call the transition function
      await attemptToTransitionSubscriptionBillingPeriod(
        completedBillingPeriod,
        ctx
      )

      // Verify that enqueueLedgerCommand was called with a BillingPeriodTransition command
      expect(effects.ledgerCommands.length).toBe(1)
      expect(effects.ledgerCommands[0].type).toBe(
        LedgerTransactionType.BillingPeriodTransition
      )
      expect(effects.ledgerCommands[0].subscriptionId).toBe(
        subscription.id
      )
      expect(effects.ledgerCommands[0].organizationId).toBe(
        organization.id
      )
      return Result.ok(undefined)
    })
  })

  // New tests for handling trial period cases
  describe('Trial Billing Period Cases', () => {
    let dummySubscriptionItem: SubscriptionItem.Record
    const now = Date.now()
    beforeEach(() => {
      dummySubscriptionItem = {
        id: 'dummy1',
        quantity: 1,
        unitPrice: 50,
        metadata: {
          name: 'Test Item',
          description: 'Test Description',
        },
        livemode: subscription.livemode,
        subscriptionId: subscription.id,
        priceId: price.id,
        addedDate: Date.now(),
        name: 'Test Item',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        externalId: null,
        createdByCommit: 'test',
        updatedByCommit: 'test',
        expiredAt: null,
        position: 0,
        type: SubscriptionItemType.Static,
        manuallyCreated: false,
        pricingModelId: pricingModel.id,
      }
    })

    it('should generate trial billing period inserts with trialPeriod true and no billing period items', () => {
      const { billingPeriodInsert, billingPeriodItemInserts } =
        billingPeriodAndItemsInsertsFromSubscription({
          subscription,
          subscriptionItems: [dummySubscriptionItem],
          trialPeriod: true,
          isInitialBillingPeriod: true,
        })
      expect(billingPeriodInsert.trialPeriod).toBe(true)
      expect(billingPeriodItemInserts).toHaveLength(0)
    })

    it('should create a trial billing period in the database with no billing period items', async () => {
      await adminTransaction(async ({ transaction }) => {
        const { billingPeriod, billingPeriodItems } = (
          await createBillingPeriodAndItems(
            {
              subscription,
              subscriptionItems: [dummySubscriptionItem],
              trialPeriod: true,
              isInitialBillingPeriod: true,
            },
            transaction
          )
        ).unwrap()
        expect(billingPeriod.trialPeriod).toBe(true)
        expect(billingPeriodItems).toHaveLength(0)
        return Result.ok(undefined)
      })
    })
  })

  it('should not transition a subscription with CreditTrial status', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Set subscription status to CreditTrial
      const creditTrialUpdate: Subscription.NonRenewingUpdate = {
        id: subscription.id,
        currentBillingPeriodEnd: null,
        currentBillingPeriodStart: null,
        interval: null,
        intervalCount: null,
        billingCycleAnchorDate: null,
        defaultPaymentMethodId: null,
        status: SubscriptionStatus.CreditTrial,
        renews: false,
      }
      await updateSubscription(
        {
          ...creditTrialUpdate,
          status: SubscriptionStatus.CreditTrial,
        },
        transaction
      )

      const result =
        await attemptToTransitionSubscriptionBillingPeriod(
          billingPeriod,
          createDiscardingEffectsContext(transaction)
        )

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toBe(
          `Cannot transition subscription ${subscription.id} in credit trial status`
        )
      }
      return Result.ok(undefined)
    })
  })

  it('should exclude manual subscription items from billing period items', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Create a regular subscription item
      const regularItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Regular Plan',
        quantity: 1,
        unitPrice: 1000,
      })

      // Create a manual subscription item (simulating one created by addFeatureToSubscriptionItem)
      const manualItem = await insertSubscriptionItem(
        {
          subscriptionId: subscription.id,
          name: 'Manual Features',
          priceId: null,
          unitPrice: 0,
          quantity: 0,
          addedDate: Date.now(),
          expiredAt: null,
          metadata: null,
          externalId: null,
          type: SubscriptionItemType.Static,
          manuallyCreated: true,
          livemode: subscription.livemode,
        },
        transaction
      )

      const { billingPeriodItemInserts } =
        billingPeriodAndItemsInsertsFromSubscription({
          subscription,
          subscriptionItems: [regularItem, manualItem],
          trialPeriod: false,
          isInitialBillingPeriod: true,
        })

      // Should only include the regular item, not the manual item
      expect(billingPeriodItemInserts.length).toBe(1)
      expect(billingPeriodItemInserts[0].name).toBe('Regular Plan')
      expect(billingPeriodItemInserts[0].unitPrice).toBe(1000)
      return Result.ok(undefined)
    })
  })

  describe('doNotCharge subscriptions', () => {
    it('should stay Active when transitioning billing periods without payment method', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Update subscription to doNotCharge=true and remove payment methods
        await updateSubscription(
          {
            id: subscription.id,
            doNotCharge: true,
            defaultPaymentMethodId: null,
            backupPaymentMethodId: null,
            status: SubscriptionStatus.Active,
            renews: subscription.renews,
          },
          transaction
        )
        // Ensure current billing period endDate is in the past
        const updatedBillingPeriod = await updateBillingPeriod(
          {
            id: billingPeriod.id,
            endDate: Date.now() - 1000,
          },
          transaction
        )

        const {
          subscription: updatedSub,
          billingRun: newBillingRun,
        } = (
          await attemptToTransitionSubscriptionBillingPeriod(
            updatedBillingPeriod,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

        // doNotCharge subscription should remain Active (not PastDue)
        expect(updatedSub.status).toBe(SubscriptionStatus.Active)
        // No billing run should be created
        expect(newBillingRun).toBeNull()
        // New billing period should be created
        expect(updatedSub.currentBillingPeriodStart).toBeGreaterThan(
          billingPeriod.startDate
        )
        return Result.ok(undefined)
      })
    })

    // Defensive test: API validation should prevent doNotCharge=true with payment methods,
    // but we test this edge case to ensure the billing period transition logic handles it correctly
    it('should not create billing run even with payment method available', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Update subscription to doNotCharge=true but keep payment method
        await updateSubscription(
          {
            id: subscription.id,
            doNotCharge: true,
            status: SubscriptionStatus.Active,
            renews: subscription.renews,
          },
          transaction
        )
        // Ensure current billing period endDate is in the past
        const updatedBillingPeriod = await updateBillingPeriod(
          {
            id: billingPeriod.id,
            endDate: Date.now() - 1000,
          },
          transaction
        )

        const {
          subscription: updatedSub,
          billingRun: newBillingRun,
        } = (
          await attemptToTransitionSubscriptionBillingPeriod(
            updatedBillingPeriod,
            createDiscardingEffectsContext(transaction)
          )
        ).unwrap()

        // Should remain Active
        expect(updatedSub.status).toBe(SubscriptionStatus.Active)
        // No billing run should be created even though payment method exists
        expect(newBillingRun).toBeNull()
        // New billing period should be created
        expect(updatedSub.currentBillingPeriodStart).toBeGreaterThan(
          billingPeriod.startDate
        )
        return Result.ok(undefined)
      })
    })
  })
})

describe('Ledger Interactions', () => {
  let pastBillingPeriod: BillingPeriod.Record

  beforeEach(async () => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const oneDayAgo = new Date()
    oneDayAgo.setDate(oneDayAgo.getDate() - 1)

    const result = await setupUsageLedgerScenario({
      subscriptionArgs: {
        currentBillingPeriodStart: thirtyDaysAgo.getTime(),
        currentBillingPeriodEnd: oneDayAgo.getTime(),
        status: SubscriptionStatus.Active,
        startDate: thirtyDaysAgo.getTime(),
      },
      subscriptionItemArgs: {
        addedDate: thirtyDaysAgo.getTime(),
      },
    })
    organization = result.organization
    pricingModel = result.pricingModel
    price = result.price
    product = result.product
    customer = result.customer
    subscription = result.subscription as Subscription.StandardRecord
    usageMeter = result.usageMeter
    subscriptionItem = result.subscriptionItem
    otherUsageMeter = (
      await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Non-Entitled Test Meter',
      })
    ).unwrap()
    ledgerAccount = result.ledgerAccount
    otherLedgerAccount = (
      await setupLedgerAccount({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: otherUsageMeter.id,
        livemode: true,
      })
    ).unwrap()
    pastBillingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: thirtyDaysAgo,
      endDate: oneDayAgo,
      status: BillingPeriodStatus.Active,
      livemode: true,
    })
    await setupBillingPeriodItem({
      billingPeriodId: pastBillingPeriod.id,
      quantity: 1,
      unitPrice: 100,
    })
  })

  describe('Credit Granting Scenarios', () => {
    it('should grant new usage credits for a subscription with entitlements when a new billing period is created', async () => {
      // setup:
      const grantAmount = 5000 // 50 dollars in cents
      await adminTransaction(async ({ transaction }) => {
        const feature = await setupUsageCreditGrantFeature({
          organizationId: organization.id,
          name: 'Monthly Credits',
          usageMeterId: usageMeter.id,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          amount: grantAmount,
          livemode: true,
        })
        const productFeature = (
          await setupProductFeature({
            organizationId: organization.id,
            productId: product.id,
            featureId: feature.id,
            livemode: true,
          })
        ).unwrap()
        await setupSubscriptionItemFeature({
          subscriptionItemId: subscriptionItem.id,
          featureId: feature.id,
          productFeatureId: productFeature.id,
          usageMeterId: usageMeter.id,
          livemode: true,
          type: FeatureType.UsageCreditGrant,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          amount: grantAmount,
        })
        return Result.ok(undefined)
      })

      // execution:
      await adminTransaction(async (params) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          createProcessingEffectsContext(params)
        )
      )

      // expects:
      await adminTransaction(async ({ transaction }) => {
        const usageCredits = await selectUsageCredits(
          { subscriptionId: subscription.id },
          transaction
        )
        const newCredit = usageCredits.find(
          (uc) => uc.issuedAmount === grantAmount
        )
        expect(newCredit).toMatchObject({})

        const allBillingPeriods = await selectBillingPeriods(
          { subscriptionId: subscription.id },
          transaction
        )
        const newBp = allBillingPeriods.find(
          (bp) => bp.startDate > pastBillingPeriod.startDate
        )
        expect(typeof newBp).toBe('object')
        expect(newCredit?.billingPeriodId).toBe(newBp!.id)

        const ledgerEntries = await selectLedgerEntries(
          { ledgerAccountId: ledgerAccount.id },
          transaction
        )
        const creditEntry = ledgerEntries.find(
          (le) =>
            le.entryType === LedgerEntryType.CreditGrantRecognized &&
            le.amount === grantAmount
        )

        expect(typeof creditEntry).toBe('object')
        expect(typeof creditEntry?.ledgerTransactionId).toBe('string')

        const balance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(balance).toBe(grantAmount)
        return Result.ok(undefined)
      })
    })

    it('should not grant usage credits if the subscription is in a terminal state', async () => {
      // setup:
      await adminTransaction(async ({ transaction }) => {
        await safelyUpdateSubscriptionStatus(
          subscription,
          SubscriptionStatus.Canceled,
          transaction
        )
        return Result.ok(undefined)
      })

      // execution:
      await adminTransaction(async (params) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          createProcessingEffectsContext(params)
        )
      )

      // expects:
      await adminTransaction(async ({ transaction }) => {
        const usageCredits = await selectUsageCredits(
          { subscriptionId: subscription.id },
          transaction
        )
        expect(usageCredits.length).toBe(0)

        const balance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(balance).toBe(0)
        return Result.ok(undefined)
      })
    })

    it('should not grant usage credits if a future billing period already exists', async () => {
      // setup:
      await adminTransaction(async ({ transaction }) => {
        const futureStartDate = pastBillingPeriod.endDate + 1000

        const futureEndDate =
          futureStartDate + 30 * 24 * 60 * 60 * 1000
        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: futureStartDate,
          endDate: futureEndDate,
          status: BillingPeriodStatus.Upcoming,
          livemode: true,
        })
        return Result.ok(undefined)
      })

      // execution:
      await adminTransaction(async (params) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          createProcessingEffectsContext(params)
        )
      )

      // expects:
      await adminTransaction(async ({ transaction }) => {
        const usageCredits = await selectUsageCredits(
          { subscriptionId: subscription.id },
          transaction
        )
        expect(usageCredits.length).toBe(0)
        const balance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(balance).toBe(0)
        return Result.ok(undefined)
      })
    })

    it('should not grant usage credits if the subscription is canceled due to a past cancelScheduledAt date', async () => {
      let canceledSub: Subscription.Record | null = null
      // setup:
      await adminTransaction(async ({ transaction }) => {
        await updateSubscription(
          {
            id: subscription.id,
            cancelScheduledAt: Date.now() - 1000,
            status: SubscriptionStatus.Active,
            renews: subscription.renews,
          },
          transaction
        )
        return Result.ok(undefined)
      })

      // execution:
      const { subscription: updatedSub } = (
        await adminTransaction(async (params) =>
          Result.ok(
            (
              await attemptToTransitionSubscriptionBillingPeriod(
                pastBillingPeriod,
                createProcessingEffectsContext(params)
              )
            ).unwrap()
          )
        )
      ).unwrap()
      canceledSub = updatedSub

      // expects:
      expect(canceledSub.status).toBe(SubscriptionStatus.Canceled)
      await adminTransaction(async ({ transaction }) => {
        const usageCredits = await selectUsageCredits(
          { subscriptionId: subscription.id },
          transaction
        )
        expect(usageCredits.length).toBe(0)

        const balance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(balance).toBe(0)
        return Result.ok(undefined)
      })
    })

    it('should not grant usage credits if the subscription has no credit entitlements', async () => {
      // execution:
      await adminTransaction(async (params) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          createProcessingEffectsContext(params)
        )
      )

      // expects:
      await adminTransaction(async ({ transaction }) => {
        const ledgerEntries = await selectLedgerEntries(
          { ledgerAccountId: ledgerAccount.id },
          transaction
        )
        const creditEntry = ledgerEntries.find(
          (le) =>
            le.entryType === LedgerEntryType.CreditGrantRecognized
        )
        expect(creditEntry).toBeUndefined()
        const balance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(balance).toBe(0)
        return Result.ok(undefined)
      })
    })

    it('should grant usage credits even if the subscription becomes PastDue', async () => {
      let pastDueSub: Subscription.Record | null = null
      // setup:
      await adminTransaction(async ({ transaction }) => {
        const grantAmount = 5000
        const feature = await setupUsageCreditGrantFeature({
          organizationId: organization.id,
          name: 'Monthly Credits',
          usageMeterId: usageMeter.id,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          amount: grantAmount,
          livemode: true,
        })
        const productFeature = (
          await setupProductFeature({
            organizationId: organization.id,
            productId: product.id,
            featureId: feature.id,
            livemode: true,
          })
        ).unwrap()
        await setupSubscriptionItemFeature({
          subscriptionItemId: subscriptionItem.id,
          featureId: feature.id,
          productFeatureId: productFeature.id,
          usageMeterId: usageMeter.id,
          type: FeatureType.UsageCreditGrant,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          amount: grantAmount,
        })

        await updateSubscription(
          {
            id: subscription.id,
            defaultPaymentMethodId: null,
            backupPaymentMethodId: null,
            status: SubscriptionStatus.Active,
            renews: subscription.renews,
          },
          transaction
        )
        return Result.ok(undefined)
      })

      // execution:
      const { subscription: updatedSub } = (
        await adminTransaction(async (params) =>
          Result.ok(
            (
              await attemptToTransitionSubscriptionBillingPeriod(
                pastBillingPeriod,
                createProcessingEffectsContext(params)
              )
            ).unwrap()
          )
        )
      ).unwrap()
      pastDueSub = updatedSub

      // expects:
      expect(pastDueSub.status).toBe(SubscriptionStatus.PastDue)
      await adminTransaction(async ({ transaction }) => {
        const grantAmount = 5000
        const creditEntry = (
          await selectLedgerEntries(
            { ledgerAccountId: ledgerAccount.id },
            transaction
          )
        ).find(
          (le) =>
            le.entryType === LedgerEntryType.CreditGrantRecognized
        )
        expect(creditEntry).toMatchObject({ amount: grantAmount })
        expect(creditEntry?.amount).toBe(grantAmount)

        const balance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(balance).toBe(grantAmount)
        return Result.ok(undefined)
      })
    })

    it('should grant multiple, distinct usage credits for different entitlements', async () => {
      // setup:
      const grantAmount1 = 5000
      const grantAmount2 = 2000
      await adminTransaction(async ({ transaction }) => {
        const feature1 = await setupUsageCreditGrantFeature({
          organizationId: organization.id,
          name: 'Monthly Credits 1',
          usageMeterId: usageMeter.id,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          amount: grantAmount1,
          livemode: true,
        })
        const feature2 = await setupUsageCreditGrantFeature({
          organizationId: organization.id,
          name: 'Monthly Credits 2',
          usageMeterId: otherUsageMeter.id,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          amount: grantAmount2,
          livemode: true,
        })
        const productFeature1 = (
          await setupProductFeature({
            organizationId: organization.id,
            productId: product.id,
            featureId: feature1.id,
            livemode: true,
          })
        ).unwrap()
        const productFeature2 = (
          await setupProductFeature({
            organizationId: organization.id,
            productId: product.id,
            featureId: feature2.id,
            livemode: true,
          })
        ).unwrap()
        await setupSubscriptionItemFeature({
          subscriptionItemId: subscriptionItem.id,
          featureId: feature1.id,
          productFeatureId: productFeature1.id,
          usageMeterId: usageMeter.id,
          type: FeatureType.UsageCreditGrant,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          amount: grantAmount1,
        })
        await setupSubscriptionItemFeature({
          subscriptionItemId: subscriptionItem.id,
          featureId: feature2.id,
          productFeatureId: productFeature2.id,
          usageMeterId: otherUsageMeter.id,
          type: FeatureType.UsageCreditGrant,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          amount: grantAmount2,
        })
        return Result.ok(undefined)
      })

      // execution:
      await adminTransaction(async (params) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          createProcessingEffectsContext(params)
        )
      )

      // expects:
      await adminTransaction(async ({ transaction }) => {
        const usageCredits = await selectUsageCredits(
          { subscriptionId: subscription.id },
          transaction
        )
        expect(usageCredits.length).toBe(2)

        const ledgerEntries1 = await selectLedgerEntries(
          { ledgerAccountId: ledgerAccount.id },
          transaction
        )
        const creditEntry1 = ledgerEntries1.find(
          (le) =>
            le.entryType === LedgerEntryType.CreditGrantRecognized &&
            le.amount === grantAmount1
        )
        expect(creditEntry1).toMatchObject({})

        const ledgerEntries2 = await selectLedgerEntries(
          { ledgerAccountId: otherLedgerAccount.id },
          transaction
        )
        const creditEntry2 = ledgerEntries2.find(
          (le) =>
            le.entryType === LedgerEntryType.CreditGrantRecognized &&
            le.amount === grantAmount2
        )
        expect(creditEntry2).toMatchObject({})

        const balance1 =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(balance1).toBe(grantAmount1)

        const balance2 =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: otherLedgerAccount.id },
            'available',
            transaction
          )
        expect(balance2).toBe(grantAmount2)
        return Result.ok(undefined)
      })
    })

    it('should not grant credits to ledger accounts for meters without entitlements', async () => {
      // setup:
      await adminTransaction(async ({ transaction }) => {
        const grantAmount = 5000
        const feature = await setupUsageCreditGrantFeature({
          organizationId: organization.id,
          name: 'Monthly Credits',
          usageMeterId: usageMeter.id,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          amount: grantAmount,
          livemode: true,
        })
        const productFeature = (
          await setupProductFeature({
            organizationId: organization.id,
            productId: product.id,
            featureId: feature.id,
            livemode: true,
          })
        ).unwrap()
        await setupSubscriptionItemFeature({
          subscriptionItemId: subscriptionItem.id,
          featureId: feature.id,
          productFeatureId: productFeature.id,
          usageMeterId: usageMeter.id,
          type: FeatureType.UsageCreditGrant,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          amount: grantAmount,
        })
        return Result.ok(undefined)
      })

      // execution:
      await adminTransaction(async (params) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          createProcessingEffectsContext(params)
        )
      )

      // expects:
      await adminTransaction(async ({ transaction }) => {
        const ledgerEntries = await selectLedgerEntries(
          { ledgerAccountId: ledgerAccount.id },
          transaction
        )
        const creditEntry = ledgerEntries.find(
          (le) =>
            le.entryType === LedgerEntryType.CreditGrantRecognized
        )
        expect(creditEntry).toMatchObject({})

        const otherLedgerEntries = await selectLedgerEntries(
          { ledgerAccountId: otherLedgerAccount.id },
          transaction
        )
        const otherCreditEntry = otherLedgerEntries.find(
          (le) =>
            le.entryType === LedgerEntryType.CreditGrantRecognized
        )
        expect(otherCreditEntry).toBeUndefined()

        const balance1 =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(balance1).toBe(5000)
        const balance2 =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: otherLedgerAccount.id },
            'available',
            transaction
          )
        expect(balance2).toBe(0)
        return Result.ok(undefined)
      })
    })

    it('should not grant "Once" credits on subsequent billing period transitions', async () => {
      // Setup: Create two features, one "Once" and one "EveryBillingPeriod"
      const onceGrantAmount = 7000
      const everyGrantAmount = 8000
      await adminTransaction(async ({ transaction }) => {
        const featureOnce = await setupUsageCreditGrantFeature({
          organizationId: organization.id,
          name: 'One-Time Credits',
          usageMeterId: usageMeter.id,
          renewalFrequency: FeatureUsageGrantFrequency.Once,
          amount: onceGrantAmount,
          livemode: true,
        })
        const featureEvery = await setupUsageCreditGrantFeature({
          organizationId: organization.id,
          name: 'Recurring Credits',
          usageMeterId: otherUsageMeter.id,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          amount: everyGrantAmount,
          livemode: true,
        })
        const productFeatureOnce = (
          await setupProductFeature({
            organizationId: organization.id,
            productId: product.id,
            featureId: featureOnce.id,
            livemode: true,
          })
        ).unwrap()
        const productFeatureEvery = (
          await setupProductFeature({
            organizationId: organization.id,
            productId: product.id,
            featureId: featureEvery.id,
            livemode: true,
          })
        ).unwrap()
        await setupSubscriptionItemFeature({
          subscriptionItemId: subscriptionItem.id,
          featureId: featureOnce.id,
          productFeatureId: productFeatureOnce.id,
          usageMeterId: usageMeter.id,
          type: FeatureType.UsageCreditGrant,
          renewalFrequency: FeatureUsageGrantFrequency.Once,
          amount: onceGrantAmount,
        })
        await setupSubscriptionItemFeature({
          subscriptionItemId: subscriptionItem.id,
          featureId: featureEvery.id,
          productFeatureId: productFeatureEvery.id,
          usageMeterId: otherUsageMeter.id,
          type: FeatureType.UsageCreditGrant,
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          amount: everyGrantAmount,
        })
        return Result.ok(undefined)
      })

      // Action: Transition the billing period. Since pastBillingPeriod exists, this is a subsequent transition.
      await adminTransaction(async (params) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          createProcessingEffectsContext(params)
        )
      )

      // Assertions:
      await adminTransaction(async ({ transaction }) => {
        // Only the "EveryBillingPeriod" credit should be granted.
        const usageCredits = await selectUsageCredits(
          { subscriptionId: subscription.id },
          transaction
        )
        expect(usageCredits.length).toBe(1)
        const newCredit = usageCredits[0]
        expect(typeof newCredit).toBe('object')
        expect(newCredit.issuedAmount).toBe(everyGrantAmount)
        expect(newCredit.usageMeterId).toBe(otherUsageMeter.id)
        expect(typeof newCredit.expiresAt).toBe('number') // Recurring grants should expire

        // Verify balances
        const balanceForOnceMeter =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(balanceForOnceMeter).toBe(0) // No credit granted for the "Once" feature

        const balanceForEveryMeter =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: otherLedgerAccount.id },
            'available',
            transaction
          )
        expect(balanceForEveryMeter).toBe(everyGrantAmount)
        return Result.ok(undefined)
      })
    })
  })

  describe('Credit Expiration Scenarios', () => {
    it('should expire a usage credit that has a balance and create a credit_grant_expired ledger entry', async () => {
      const expiringCredit = (
        await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 500,
          usageMeterId: usageMeter.id,
          expiresAt: pastBillingPeriod.endDate,
          livemode: true,
        })
      ).unwrap()
      const ledgerTx = (
        await setupLedgerTransaction({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.AdminCreditAdjusted,
        })
      ).unwrap()
      const ledgerEntries = await setupLedgerEntries({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: ledgerTx.id,
        ledgerAccountId: ledgerAccount.id,
        usageMeterId: usageMeter.id,
        entries: [
          {
            entryType: LedgerEntryType.CreditGrantRecognized,
            sourceUsageCreditId: expiringCredit.id,
            amount: 500,
          },
        ],
      })
      await adminTransaction(async (params) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          createProcessingEffectsContext(params)
        )
      )

      const expiredLedgerEntryResult = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await selectLedgerEntries(
              {
                sourceUsageCreditId: expiringCredit.id,
                entryType: LedgerEntryType.CreditGrantExpired,
              },
              transaction
            )
          )
        })
      ).unwrap()
      const expiredLedgerEntry = expiredLedgerEntryResult.find(
        (le: LedgerEntry.Record) =>
          le.entryType === LedgerEntryType.CreditGrantExpired
      )

      expect(expiredLedgerEntry).toMatchObject({ amount: 500 })
      expect(expiredLedgerEntry!.amount).toBe(500)

      await adminTransaction(async ({ transaction }) => {
        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(finalBalance).toBe(0)
        return Result.ok(undefined)
      })
    })

    it('should expire a usage credit that has a partial balance and create a credit_grant_expired ledger entry for the remaining balance', async () => {
      const expiringCredit = (
        await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 1000,
          usageMeterId: usageMeter.id,
          expiresAt: pastBillingPeriod.endDate,
          livemode: true,
        })
      ).unwrap()

      const grantTx = (
        await setupLedgerTransaction({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.AdminCreditAdjusted,
        })
      ).unwrap()
      await setupLedgerEntries({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: grantTx.id,
        ledgerAccountId: ledgerAccount.id,
        usageMeterId: usageMeter.id,
        entries: [
          {
            entryType: LedgerEntryType.CreditGrantRecognized,
            sourceUsageCreditId: expiringCredit.id,
            amount: 1000,
          },
        ],
      })

      const usageEvent = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 400,
        priceId: price.id,
        billingPeriodId: pastBillingPeriod.id,
        transactionId: 'test-tx-1',
        customerId: customer.id,
        livemode: true,
      })
      const creditApplication = (
        await setupUsageCreditApplication({
          organizationId: organization.id,
          usageCreditId: expiringCredit.id,
          amountApplied: 400,
          usageEventId: usageEvent.id,
        })
      ).unwrap()
      const usageTx = (
        await setupLedgerTransaction({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.UsageEventProcessed,
        })
      ).unwrap()
      await setupLedgerEntries({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: usageTx.id,
        ledgerAccountId: ledgerAccount.id,
        usageMeterId: usageMeter.id,
        entries: [
          {
            entryType:
              LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance,
            sourceCreditApplicationId: creditApplication.id,
            sourceUsageEventId: usageEvent.id,
            sourceUsageCreditId: expiringCredit.id,
            amount: 400,
          },
        ],
      })

      await adminTransaction(async (params) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          createProcessingEffectsContext(params)
        )
      )

      const ledgerEntries = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await selectLedgerEntries(
              {
                sourceUsageCreditId: expiringCredit.id,
              },
              transaction
            )
          )
        })
      ).unwrap()

      const expiredLedgerEntry = ledgerEntries.find(
        (le: LedgerEntry.Record) =>
          le.entryType === LedgerEntryType.CreditGrantExpired
      )
      expect(expiredLedgerEntry).toMatchObject({ amount: 600 })
      expect(expiredLedgerEntry!.amount).toBe(600) // 1000 - 400

      await adminTransaction(async ({ transaction }) => {
        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(finalBalance).toBe(0)
        return Result.ok(undefined)
      })
    })

    it('should not create a credit_grant_expired ledger entry for a usage credit with a zero balance', async () => {
      const expiringCredit = (
        await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 1000,
          usageMeterId: usageMeter.id,
          expiresAt: pastBillingPeriod.endDate,
          livemode: true,
        })
      ).unwrap()

      const grantTx = (
        await setupLedgerTransaction({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.AdminCreditAdjusted,
        })
      ).unwrap()
      await setupLedgerEntries({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: grantTx.id,
        ledgerAccountId: ledgerAccount.id,
        usageMeterId: usageMeter.id,
        entries: [
          {
            entryType: LedgerEntryType.CreditGrantRecognized,
            sourceUsageCreditId: expiringCredit.id,
            amount: 1000,
          },
        ],
      })

      const usageEvent = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 1000,
        priceId: price.id,
        billingPeriodId: pastBillingPeriod.id,
        transactionId: 'test-tx-1',
        customerId: customer.id,
        livemode: false,
      })
      const creditApplication = (
        await setupUsageCreditApplication({
          organizationId: organization.id,
          usageCreditId: expiringCredit.id,
          amountApplied: 1000,
          usageEventId: usageEvent.id,
        })
      ).unwrap()
      const usageTx = (
        await setupLedgerTransaction({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.UsageEventProcessed,
        })
      ).unwrap()
      await setupLedgerEntries({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: usageTx.id,
        ledgerAccountId: ledgerAccount.id,
        usageMeterId: usageMeter.id,
        entries: [
          {
            entryType:
              LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance,
            sourceCreditApplicationId: creditApplication.id,
            sourceUsageEventId: usageEvent.id,
            sourceUsageCreditId: expiringCredit.id,
            amount: 1000,
          },
        ],
      })

      await adminTransaction(async (params) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          createProcessingEffectsContext(params)
        )
      )

      const ledgerEntries = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await selectLedgerEntries(
              {
                sourceUsageCreditId: expiringCredit.id,
              },
              transaction
            )
          )
        })
      ).unwrap()
      const expiredLedgerEntry = ledgerEntries.find(
        (le: LedgerEntry.Record) =>
          le.entryType === LedgerEntryType.CreditGrantExpired
      )

      expect(expiredLedgerEntry).toBeUndefined()

      await adminTransaction(async ({ transaction }) => {
        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(finalBalance).toBe(0)
        return Result.ok(undefined)
      })
    })

    it('should not expire a usage credit that has a null expiresAt', async () => {
      const nonExpiringCredit = (
        await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 700,
          usageMeterId: usageMeter.id,
          expiresAt: null, // This credit should not expire
          livemode: false,
        })
      ).unwrap()

      const ledgerTx = (
        await setupLedgerTransaction({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.AdminCreditAdjusted,
        })
      ).unwrap()
      await setupLedgerEntries({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: ledgerTx.id,
        ledgerAccountId: ledgerAccount.id,
        usageMeterId: usageMeter.id,
        entries: [
          {
            entryType: LedgerEntryType.CreditGrantRecognized,
            sourceUsageCreditId: nonExpiringCredit.id,
            amount: 700,
          },
        ],
      })

      await adminTransaction(async (params) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          createProcessingEffectsContext(params)
        )
      )

      const ledgerEntries = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await selectLedgerEntries(
              {
                sourceUsageCreditId: nonExpiringCredit.id,
              },
              transaction
            )
          )
        })
      ).unwrap()
      const expiredLedgerEntry = ledgerEntries.find(
        (le: LedgerEntry.Record) =>
          le.entryType === LedgerEntryType.CreditGrantExpired
      )

      expect(expiredLedgerEntry).toBeUndefined()

      await adminTransaction(async ({ transaction }) => {
        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(finalBalance).toBe(700)
        return Result.ok(undefined)
      })
    })

    it('should not expire credits with a future expiration date', async () => {
      const futureCredit = (
        await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 10000,
          usageMeterId: usageMeter.id,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          livemode: false,
        })
      ).unwrap()

      const ledgerTx = (
        await setupLedgerTransaction({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.AdminCreditAdjusted,
        })
      ).unwrap()
      await setupLedgerEntries({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: ledgerTx.id,
        ledgerAccountId: ledgerAccount.id,
        usageMeterId: usageMeter.id,
        entries: [
          {
            entryType: LedgerEntryType.CreditGrantRecognized,
            sourceUsageCreditId: futureCredit.id,
            amount: 10000,
          },
        ],
      })

      await adminTransaction(async (params) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          createProcessingEffectsContext(params)
        )
      )

      const ledgerEntries = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await selectLedgerEntries(
              {
                sourceUsageCreditId: futureCredit.id,
              },
              transaction
            )
          )
        })
      ).unwrap()
      const expiredLedgerEntry = ledgerEntries.find(
        (le: LedgerEntry.Record) =>
          le.entryType === LedgerEntryType.CreditGrantExpired
      )
      expect(expiredLedgerEntry).toBeUndefined()

      await adminTransaction(async ({ transaction }) => {
        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(finalBalance).toBe(10000)
        return Result.ok(undefined)
      })
    })

    it('should correctly handle a mix of expiring and non-expiring credits', async () => {
      // Expiring credit with balance
      const expiringCredit = (
        await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 100,
          usageMeterId: usageMeter.id,
          expiresAt: pastBillingPeriod.endDate,
          livemode: false,
        })
      ).unwrap()
      const ledgerTx1 = (
        await setupLedgerTransaction({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.AdminCreditAdjusted,
        })
      ).unwrap()
      await setupLedgerEntries({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: ledgerTx1.id,
        ledgerAccountId: ledgerAccount.id,
        usageMeterId: usageMeter.id,
        entries: [
          {
            entryType: LedgerEntryType.CreditGrantRecognized,
            sourceUsageCreditId: expiringCredit.id,
            amount: 100,
          },
        ],
      })

      // Evergreen credit with balance
      const evergreenCredit = (
        await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 200,
          usageMeterId: usageMeter.id,
          expiresAt: null,
          livemode: false,
        })
      ).unwrap()
      const ledgerTx2 = (
        await setupLedgerTransaction({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.AdminCreditAdjusted,
        })
      ).unwrap()
      await setupLedgerEntries({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: ledgerTx2.id,
        ledgerAccountId: ledgerAccount.id,
        usageMeterId: usageMeter.id,
        entries: [
          {
            entryType: LedgerEntryType.CreditGrantRecognized,
            sourceUsageCreditId: evergreenCredit.id,
            amount: 200,
          },
        ],
      })

      // Future-expiring credit with balance
      const futureCredit = (
        await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 300,
          usageMeterId: usageMeter.id,
          expiresAt: pastBillingPeriod.endDate + 10000, // Expires after transition
          livemode: false,
        })
      ).unwrap()
      const ledgerTx3 = (
        await setupLedgerTransaction({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.AdminCreditAdjusted,
        })
      ).unwrap()
      await setupLedgerEntries({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: ledgerTx3.id,
        ledgerAccountId: ledgerAccount.id,
        usageMeterId: usageMeter.id,
        entries: [
          {
            entryType: LedgerEntryType.CreditGrantRecognized,
            sourceUsageCreditId: futureCredit.id,
            amount: 300,
          },
        ],
      })

      // Action
      await adminTransaction(async (params) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          createProcessingEffectsContext(params)
        )
      )
      // Assertions
      await adminTransaction(async ({ transaction }) => {
        // Check expiring credit
        const expiringEntries = await selectLedgerEntries(
          {
            sourceUsageCreditId: expiringCredit.id,
          },
          transaction
        )
        const expiringEntry = expiringEntries.find(
          (le: LedgerEntry.Record) =>
            le.entryType === LedgerEntryType.CreditGrantExpired
        )
        expect(expiringEntry).toMatchObject({ amount: 100 })
        expect(expiringEntry!.amount).toBe(100)

        // Check evergreen credit
        const evergreenEntries = await selectLedgerEntries(
          {
            sourceUsageCreditId: evergreenCredit.id,
          },
          transaction
        )
        const evergreenEntry = evergreenEntries.find(
          (le: LedgerEntry.Record) =>
            le.entryType === LedgerEntryType.CreditGrantExpired
        )
        expect(evergreenEntry).toBeUndefined()

        // Check future credit
        const futureEntries = await selectLedgerEntries(
          {
            sourceUsageCreditId: futureCredit.id,
          },
          transaction
        )
        const futureEntry = futureEntries.find(
          (le: LedgerEntry.Record) =>
            le.entryType === LedgerEntryType.CreditGrantExpired
        )
        expect(futureEntry).toBeUndefined()

        // Check final balance
        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            {
              ledgerAccountId: ledgerAccount.id,
            },
            'available',
            transaction
          )
        expect(finalBalance).toBe(500)
        return Result.ok(undefined)
      })
    })

    it('should handle expiring credits and new grant entitlements', async () => {
      // Setup:
      // 1. An expiring credit
      const expiringAmount = 150
      const expiringCredit = (
        await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: expiringAmount,
          usageMeterId: usageMeter.id,
          expiresAt: pastBillingPeriod.endDate,
          livemode: true,
        })
      ).unwrap()
      const expiringTx = (
        await setupLedgerTransaction({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.AdminCreditAdjusted,
        })
      ).unwrap()
      await setupLedgerEntries({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: expiringTx.id,
        ledgerAccountId: ledgerAccount.id,
        usageMeterId: usageMeter.id,
        entries: [
          {
            entryType: LedgerEntryType.CreditGrantRecognized,
            sourceUsageCreditId: expiringCredit.id,
            amount: expiringAmount,
          },
        ],
      })

      // 2. A new grant entitlement
      const grantAmount = 250
      const feature = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        name: 'New Monthly Credits',
        usageMeterId: usageMeter.id,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        amount: grantAmount,
        livemode: true,
      })
      const productFeature = (
        await setupProductFeature({
          organizationId: organization.id,
          productId: product.id,
          featureId: feature.id,
          livemode: true,
        })
      ).unwrap()
      await setupSubscriptionItemFeature({
        subscriptionItemId: subscriptionItem.id,
        featureId: feature.id,
        productFeatureId: productFeature.id,
        usageMeterId: usageMeter.id,
        livemode: true,
        type: FeatureType.UsageCreditGrant,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        amount: grantAmount,
      })

      // Action:
      await adminTransaction(async (params) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          createProcessingEffectsContext(params)
        )
      )

      // Assertions:
      await adminTransaction(async ({ transaction }) => {
        // 1. Check expiration
        const expiredEntries = await selectLedgerEntries(
          {
            sourceUsageCreditId: expiringCredit.id,
            entryType: LedgerEntryType.CreditGrantExpired,
          },
          transaction
        )
        expect(expiredEntries.length).toBe(1)
        expect(expiredEntries[0].amount).toBe(expiringAmount)

        // 2. Check new grant
        const usageCredits = await selectUsageCredits(
          {
            subscriptionId: subscription.id,
            issuedAmount: grantAmount,
          },
          transaction
        )
        expect(usageCredits.length).toBe(1)
        const newCredit = usageCredits[0]
        expect(newCredit).toMatchObject({})

        const grantEntries = await selectLedgerEntries(
          {
            sourceUsageCreditId: newCredit.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
          },
          transaction
        )
        expect(grantEntries.length).toBe(1)
        expect(grantEntries[0].amount).toBe(grantAmount)

        // 3. Check final balance
        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            {
              ledgerAccountId: ledgerAccount.id,
            },
            'available',
            transaction
          )
        // Initial: 150. Expired: -150. New Grant: +250. Final: 250.
        expect(finalBalance).toBe(grantAmount)
        return Result.ok(undefined)
      })
    })

    it('should handle expiring credits, non-expiring credits, and new grant entitlements', async () => {
      // Setup:
      // 1. An expiring credit
      const expiringAmount = 100
      const expiringCredit = (
        await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: expiringAmount,
          usageMeterId: usageMeter.id,
          expiresAt: pastBillingPeriod.endDate,
          livemode: true,
        })
      ).unwrap()
      const expiringTx = (
        await setupLedgerTransaction({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.AdminCreditAdjusted,
        })
      ).unwrap()
      await setupLedgerEntries({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: expiringTx.id,
        ledgerAccountId: ledgerAccount.id,
        usageMeterId: usageMeter.id,
        entries: [
          {
            entryType: LedgerEntryType.CreditGrantRecognized,
            sourceUsageCreditId: expiringCredit.id,
            amount: expiringAmount,
          },
        ],
      })

      // 2. A non-expiring (evergreen) credit
      const evergreenAmount = 200
      const evergreenCredit = (
        await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: evergreenAmount,
          usageMeterId: usageMeter.id,
          expiresAt: null,
          livemode: true,
        })
      ).unwrap()
      const evergreenTx = (
        await setupLedgerTransaction({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.AdminCreditAdjusted,
        })
      ).unwrap()
      await setupLedgerEntries({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: evergreenTx.id,
        ledgerAccountId: ledgerAccount.id,
        usageMeterId: usageMeter.id,
        entries: [
          {
            entryType: LedgerEntryType.CreditGrantRecognized,
            sourceUsageCreditId: evergreenCredit.id,
            amount: evergreenAmount,
          },
        ],
      })

      // 3. A new grant entitlement
      const grantAmount = 300
      const feature = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        name: 'New Monthly Credits',
        usageMeterId: usageMeter.id,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        amount: grantAmount,
        livemode: true,
      })
      const productFeature = (
        await setupProductFeature({
          organizationId: organization.id,
          productId: product.id,
          featureId: feature.id,
          livemode: true,
        })
      ).unwrap()
      await setupSubscriptionItemFeature({
        subscriptionItemId: subscriptionItem.id,
        featureId: feature.id,
        productFeatureId: productFeature.id,
        usageMeterId: usageMeter.id,
        livemode: true,
        type: FeatureType.UsageCreditGrant,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        amount: grantAmount,
      })

      // Action:
      await adminTransaction(async (params) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          createProcessingEffectsContext(params)
        )
      )

      // Assertions:
      await adminTransaction(async ({ transaction }) => {
        // 1. Check expiration
        const expiredEntries = await selectLedgerEntries(
          {
            sourceUsageCreditId: expiringCredit.id,
            entryType: LedgerEntryType.CreditGrantExpired,
          },
          transaction
        )
        expect(expiredEntries.length).toBe(1)
        expect(expiredEntries[0].amount).toBe(expiringAmount)

        // 2. Check that evergreen credit was NOT expired
        const evergreenExpiredEntries = await selectLedgerEntries(
          {
            sourceUsageCreditId: evergreenCredit.id,
            entryType: LedgerEntryType.CreditGrantExpired,
          },
          transaction
        )
        expect(evergreenExpiredEntries.length).toBe(0)

        // 3. Check new grant
        const usageCredits = await selectUsageCredits(
          {
            subscriptionId: subscription.id,
            issuedAmount: grantAmount,
          },
          transaction
        )
        expect(usageCredits.length).toBe(1)

        // 4. Check final balance
        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            {
              ledgerAccountId: ledgerAccount.id,
            },
            'available',
            transaction
          )
        // Initial: 100 (expiring) + 200 (evergreen) = 300
        // Expired: -100. New Grant: +300. Final: 200 + 300 = 500.
        expect(finalBalance).toBe(evergreenAmount + grantAmount)
        return Result.ok(undefined)
      })
    })
  })
})

describe('Resource claim expiration during billing period transition', async () => {
  const { organization, price, pricingModel } = (
    await setupOrg()
  ).unwrap()

  it('releases resource claims with expiredAt set during billing period transition', async () => {
    // Setup customer and payment method
    const customer = (
      await setupCustomer({
        organizationId: organization.id,
      })
    ).unwrap()
    const paymentMethod = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
    ).unwrap()

    // Create subscription with billing period in the past (ready for transition)
    const now = Date.now()
    const subscription = (await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      paymentMethodId: paymentMethod.id,
      currentBillingPeriodEnd: now - 3000, // 3 seconds ago
      currentBillingPeriodStart: now - 30 * 24 * 60 * 60 * 1000, // 30 days ago
      renews: true,
    })) as Subscription.StandardRecord

    const billingPeriod = await setupBillingPeriod({
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

    // Create a resource for claims
    const resource = (
      await setupResource({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        slug: 'seats',
        name: 'Seats',
      })
    ).unwrap()

    // Create resource feature with capacity
    const resourceFeature = (
      await setupResourceFeature({
        organizationId: organization.id,
        name: 'Seats Feature',
        resourceId: resource.id,
        livemode: true,
        pricingModelId: pricingModel.id,
        amount: 10,
      })
    ).unwrap()

    // Create subscription item
    const subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      priceId: price.id,
      name: price.name ?? 'Basic Plan',
      quantity: 1,
      unitPrice: price.unitPrice,
      type: SubscriptionItemType.Static,
    })

    // Link feature to subscription item
    await setupResourceSubscriptionItemFeature({
      subscriptionItemId: subscriptionItem.id,
      featureId: resourceFeature.id,
      resourceId: resource.id,
      pricingModelId: pricingModel.id,
      amount: 10,
    })

    // Create two resource claims:
    // 1. A normal claim without expiration
    // 2. A claim with expiredAt set (simulating a claim made during interim period before a downgrade)
    const normalClaim = (
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: 'user_normal',
      })
    ).unwrap()

    const expiredClaim = (
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: 'user_expired',
        expiredAt: now - 60 * 1000, // Expired 1 minute ago
      })
    ).unwrap()

    // Verify initial state: both claims exist and are not released
    const claimsBefore = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await selectResourceClaims(
            { subscriptionId: subscription.id },
            transaction
          )
        )
      })
    ).unwrap()
    expect(claimsBefore.length).toBe(2)
    expect(claimsBefore.every((c) => c.releasedAt === null)).toBe(
      true
    )

    // Transition the billing period
    await adminTransaction(async (params) =>
      Result.ok(
        (
          await attemptToTransitionSubscriptionBillingPeriod(
            billingPeriod,
            createProcessingEffectsContext(params)
          )
        ).unwrap()
      )
    )

    // Verify claims after transition
    const claimsAfter = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await selectResourceClaims(
            { subscriptionId: subscription.id },
            transaction
          )
        )
      })
    ).unwrap()
    expect(claimsAfter.length).toBe(2)

    // The normal claim should still be active (not released)
    const normalClaimAfter = claimsAfter.find(
      (c) => c.id === normalClaim.id
    )
    expect(normalClaimAfter).toMatchObject({
      id: normalClaim.id,
      releasedAt: null,
      releaseReason: null,
    })

    // The expired claim should be released with reason 'expired'
    const expiredClaimAfter = claimsAfter.find(
      (c) => c.id === expiredClaim.id
    )
    expect(expiredClaimAfter).toMatchObject({
      id: expiredClaim.id,
      releaseReason: 'expired',
    })
    expect(expiredClaimAfter!.releasedAt).toBeGreaterThan(0)
  })
})
