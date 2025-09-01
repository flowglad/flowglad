import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest'
import {
  attemptToTransitionSubscriptionBillingPeriod,
  billingPeriodAndItemsInsertsFromSubscription,
  createBillingPeriodAndItems,
} from '@/subscriptions/billingPeriodHelpers'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  FeatureType,
  InvoiceStatus,
  LedgerEntryType,
  PaymentStatus,
  SubscriptionItemType,
  SubscriptionStatus,
  UsageCreditType,
} from '@/types'
import {
  selectBillingPeriods,
  updateBillingPeriod,
} from '@/db/tableMethods/billingPeriodMethods'
import {
  safelyUpdateSubscriptionStatus,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import {
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPayment,
  setupBillingPeriodItem,
  setupPaymentMethod,
  setupSubscription,
  setupBillingRun,
  setupBillingPeriod,
  setupUsageMeter,
  setupLedgerAccount,
  setupUsageCreditGrantFeature,
  setupProductFeature,
  setupSubscriptionItemFeature,
  setupSubscriptionItem,
  setupUsageCredit,
  setupUsageLedgerScenario,
} from '../../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import { Customer } from '@/db/schema/customers'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { BillingRun } from '@/db/schema/billingRuns'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Subscription } from '@/db/schema/subscriptions'
import core from '@/utils/core'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { UsageMeter } from '@/db/schema/usageMeters'
import { LedgerAccount } from '@/db/schema/ledgerAccounts'
import {
  selectLedgerEntries,
  aggregateBalanceForLedgerAccountFromEntries,
} from '@/db/tableMethods/ledgerEntryMethods'
import { processBillingPeriodTransitionLedgerCommand } from '@/db/ledgerManager/billingPeriodTransitionLedgerCommand'
import { selectUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { Organization } from '@/db/schema/organizations'
import { PricingModel } from '@/db/schema/pricingModels'
import {
  FeatureUsageGrantFrequency,
  LedgerTransactionType,
  UsageCreditStatus,
} from '@/types'
import { UsageCredit } from '@/db/schema/usageCredits'
import {
  setupLedgerTransaction,
  setupLedgerEntries,
  setupUsageEvent,
  setupUsageCreditApplication,
} from '../../seedDatabase'
import { LedgerEntry } from '@/db/schema/ledgerEntries'

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
let pastBillingPeriod: BillingPeriod.Record

describe('Subscription Billing Period Transition', async () => {
  const { organization, price, product, pricingModel } =
    await setupOrg()

  beforeEach(async () => {
    customer = await setupCustomer({
      organizationId: organization.id,
    })
    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    subscription = (await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      paymentMethodId: paymentMethod.id,
      currentBillingPeriodEnd: new Date(Date.now() - 3000),
      currentBillingPeriodStart: new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ),
      renews: true,
    })) as Subscription.StandardRecord
    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: subscription.currentBillingPeriodStart,
      endDate: subscription.currentBillingPeriodEnd,
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
      const {
        result: {
          subscription: updatedSub,
          billingRun: newBillingRun,
        },
      } = await attemptToTransitionSubscriptionBillingPeriod(
        updatedBillingPeriod,
        transaction
      )

      // Expect that the subscription's current billing period dates are updated (i.e. a new period was created)
      expect(updatedSub.currentBillingPeriodStart).not.toEqual(
        updatedBillingPeriod.startDate
      )
      // And because a valid payment method exists, a billing run should be created
      expect(newBillingRun).toBeDefined()
    })
  })

  // Test 2: Billing period endDate in the future should throw an error
  it('should throw an error if the billing period endDate is in the future', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Create a copy of billingPeriod with an endDate in the future
      const futureBillingPeriod = {
        ...billingPeriod,
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }
      await expect(
        attemptToTransitionSubscriptionBillingPeriod(
          futureBillingPeriod,
          transaction
        )
      ).rejects.toThrow(/Cannot close billing period/)
    })
  })

  // Test 3: When payment totals fully cover the billing period, mark it as Completed
  it('should mark the current billing period as Completed if fully paid', async () => {
    const invoice = await setupInvoice({
      billingPeriodId: billingPeriod.id,
      status: InvoiceStatus.Paid,
      customerId: customer.id,
      organizationId: organization.id,
      priceId: price.id,
    })
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
      const {
        result: { subscription: updatedSub },
      } = await attemptToTransitionSubscriptionBillingPeriod(
        billingPeriod,
        transaction
      )

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
      const {
        result: {
          subscription: updatedSub,
          billingRun: newBillingRun,
        },
      } = await attemptToTransitionSubscriptionBillingPeriod(
        billingPeriod,
        transaction
      )

      expect(newBillingRun).toBeNull()
      expect(updatedSub.status).toBe(SubscriptionStatus.Canceled)
    })
  })

  //   // Test 5: If subscription.cancelScheduledAt is in the past, cancel the subscription.
  it('should cancel the subscription if cancelScheduledAt is in the past', async () => {
    await adminTransaction(async ({ transaction }) => {
      const pastDate = new Date(Date.now() - 1000)
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

      const {
        result: {
          subscription: updatedSub,
          billingRun: newBillingRun,
        },
      } = await attemptToTransitionSubscriptionBillingPeriod(
        updatedBillingPeriod,
        transaction
      )

      expect(updatedSub.status).toBe(SubscriptionStatus.Canceled)
      expect(updatedSub.canceledAt).toBeDefined()
      expect(newBillingRun).toBeNull()
    })
  })

  // Test 6: Normal transition when subscription is active with a valid payment method.
  it('should create a new active billing period and billing run for active subscription with valid payment method', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Ensure the current billing period has already ended
      const updatedBillingPeriod = await updateBillingPeriod(
        {
          id: billingPeriod.id,
          endDate: new Date(Date.now() - 1000),
        },
        transaction
      )

      const {
        result: {
          subscription: updatedSub,
          billingRun: newBillingRun,
        },
      } = await attemptToTransitionSubscriptionBillingPeriod(
        updatedBillingPeriod,
        transaction
      )

      // Verify that subscription billing period dates have been updated to new period values
      expect(updatedSub.currentBillingPeriodStart).not.toEqual(
        updatedBillingPeriod.startDate
      )
      expect(updatedSub.currentBillingPeriodEnd).toBeDefined()
      // And a billing run was created with scheduledFor equal to the new period's start date
      expect(newBillingRun).toBeDefined()
      expect(newBillingRun?.scheduledFor.getTime()).toEqual(
        new Date(updatedSub.currentBillingPeriodStart).getTime()
      )
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
          endDate: new Date(Date.now() - 1000),
        },
        transaction
      )

      const {
        result: {
          subscription: updatedSub,
          billingRun: newBillingRun,
        },
      } = await attemptToTransitionSubscriptionBillingPeriod(
        updatedBillingPeriod,
        transaction
      )

      // Expect no billing run is created and subscription status is updated to PastDue
      expect(newBillingRun).toBeNull()
      expect(updatedSub.status).toBe(SubscriptionStatus.PastDue)
      expect(updatedSub.currentBillingPeriodStart).not.toEqual(
        billingPeriod.startDate
      )
    })
  })

  // Test 8: No new future billing period should be created when subscription.cancelScheduledAt >= last billing period end.
  it('should not create a new billing period if subscription.cancelScheduledAt is set and >= current billing period end date', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Set subscription.cancelScheduledAt to just after the current billing period end
      const futureEnd = new Date(
        billingPeriod.endDate.getTime() + 50000
      )
      subscription.cancelScheduledAt = futureEnd
      await updateSubscription(
        {
          id: subscription.id,
          cancelScheduledAt: futureEnd,
          status: SubscriptionStatus.Active,
          renews: subscription.renews,
        },
        transaction
      )

      // Ensure current billing period is closed (endDate in past)
      const updatedBillingPeriod = await updateBillingPeriod(
        {
          id: billingPeriod.id,
          endDate: new Date(Date.now() - 1000),
        },
        transaction
      )
      const {
        result: {
          subscription: updatedSub,
          billingRun: newBillingRun,
        },
      } = await attemptToTransitionSubscriptionBillingPeriod(
        updatedBillingPeriod,
        transaction
      )

      // Since attemptToCreateFutureBillingPeriodForSubscription returns null,
      // billingRun remains null and subscription status is set to PastDue.
      expect(newBillingRun).toBeNull()
      expect(updatedSub.status).toBe(SubscriptionStatus.PastDue)
      // The subscription's current billing period dates should remain unchanged.
      expect(updatedSub.currentBillingPeriodStart.getTime()).toEqual(
        subscription.currentBillingPeriodStart.getTime()
      )
      expect(updatedSub.currentBillingPeriodEnd.getTime()).toEqual(
        subscription.currentBillingPeriodEnd.getTime()
      )
    })
  })

  // Test 12: Edge-case when billing period payment totals exactly match billing item total.
  it('should mark the billing period as Completed when total due exactly equals total paid', async () => {
    // Simulate full payment by creating a paid invoice
    const invoice = await setupInvoice({
      billingPeriodId: billingPeriod.id,
      status: InvoiceStatus.Paid,
      customerId: customer.id,
      organizationId: organization.id,
      priceId: price.id,
    })

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
          endDate: new Date(Date.now() - 1000),
        },
        transaction
      )
      const {
        result: {
          subscription: updatedSub,
          updatedBillingPeriod: uBP,
        },
      } = await attemptToTransitionSubscriptionBillingPeriod(
        updatedBillingPeriod,
        transaction
      )
      const allBPeriods = await selectBillingPeriods(
        { subscriptionId: subscription.id },
        transaction
      )
      const currentBp = allBPeriods.find(
        (bp) => bp.id === billingPeriod.id
      )
      expect(currentBp?.status).toBe(BillingPeriodStatus.Completed)
    })
  })

  // Test 13: When required billing period data is missing (e.g. endDate), throw an error.
  it('should throw an error when billing period endDate is missing', async () => {
    await adminTransaction(async ({ transaction }) => {
      const invalidBillingPeriod = {
        ...billingPeriod,
        endDate: new Date('lol'),
      }
      await expect(
        attemptToTransitionSubscriptionBillingPeriod(
          invalidBillingPeriod,
          transaction
        )
      ).rejects.toThrow()
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
      const {
        result: {
          subscription: updatedSub,
          billingRun: newBillingRun,
        },
      } = await attemptToTransitionSubscriptionBillingPeriod(
        updatedBillingPeriod,
        transaction
      )
      // Expect that the subscription's current billing period dates are updated.
      expect(updatedSub.currentBillingPeriodStart).not.toEqual(
        updatedBillingPeriod.startDate
      )
      // And because a valid payment method exists, a billing run should be created.
      expect(newBillingRun).toBeDefined()
    })
  })

  // ... Other tests ...

  it('should throw an error when billing period endDate is missing', async () => {
    await adminTransaction(async ({ transaction }) => {
      const invalidBillingPeriod = {
        ...billingPeriod,
        endDate: new Date('lol'),
      }
      await expect(
        attemptToTransitionSubscriptionBillingPeriod(
          invalidBillingPeriod,
          transaction
        )
      ).rejects.toThrow()
    })
  })

  // New tests for handling trial period cases
  describe('Trial Billing Period Cases', () => {
    let dummySubscriptionItem: SubscriptionItem.Record

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
        addedDate: new Date(),
        name: 'Test Item',
        createdAt: new Date(),
        updatedAt: new Date(),
        externalId: null,
        createdByCommit: 'test',
        updatedByCommit: 'test',
        expiredAt: null,
        position: 0,
        type: SubscriptionItemType.Static,
        usageMeterId: null,
        usageEventsPerUnit: null,
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
        const { billingPeriod, billingPeriodItems } =
          await createBillingPeriodAndItems(
            {
              subscription,
              subscriptionItems: [dummySubscriptionItem],
              trialPeriod: true,
              isInitialBillingPeriod: true,
            },
            transaction
          )
        expect(billingPeriod.trialPeriod).toBe(true)
        expect(billingPeriodItems).toHaveLength(0)
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

      await expect(
        attemptToTransitionSubscriptionBillingPeriod(
          billingPeriod,
          transaction
        )
      ).rejects.toThrow(
        `Cannot transition subscription ${subscription.id} in credit trial status`
      )
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
        currentBillingPeriodStart: thirtyDaysAgo,
        currentBillingPeriodEnd: oneDayAgo,
        status: SubscriptionStatus.Active,
        startDate: thirtyDaysAgo,
      },
      subscriptionItemArgs: {
        addedDate: thirtyDaysAgo,
      },
    })
    organization = result.organization
    pricingModel = result.pricingModel
    price = result.price
    product = result.product
    subscription = result.subscription as Subscription.StandardRecord
    usageMeter = result.usageMeter
    subscriptionItem = result.subscriptionItem
    otherUsageMeter = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Non-Entitled Test Meter',
    })
    ledgerAccount = result.ledgerAccount
    otherLedgerAccount = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: otherUsageMeter.id,
      livemode: true,
    })
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
        const productFeature = await setupProductFeature({
          organizationId: organization.id,
          productId: product.id,
          featureId: feature.id,
          livemode: true,
        })
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
      })

      // execution:
      await comprehensiveAdminTransaction(async ({ transaction }) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          transaction
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
        expect(newCredit).toBeDefined()

        const allBillingPeriods = await selectBillingPeriods(
          { subscriptionId: subscription.id },
          transaction
        )
        const newBp = allBillingPeriods.find(
          (bp) => bp.startDate > pastBillingPeriod.startDate
        )
        expect(newBp).toBeDefined()
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

        expect(creditEntry).toBeDefined()
        expect(creditEntry?.ledgerTransactionId).toBeDefined()

        const balance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(balance).toBe(grantAmount)
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
      })

      // execution:
      await comprehensiveAdminTransaction(async ({ transaction }) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          transaction
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
      })
    })

    it('should not grant usage credits if a future billing period already exists', async () => {
      // setup:
      await adminTransaction(async ({ transaction }) => {
        const futureStartDate = new Date(
          pastBillingPeriod.endDate.getTime() + 1000
        )
        const futureEndDate = new Date(
          futureStartDate.getTime() + 30 * 24 * 60 * 60 * 1000
        )
        await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: futureStartDate,
          endDate: futureEndDate,
          status: BillingPeriodStatus.Upcoming,
          livemode: true,
        })
      })

      // execution:
      await comprehensiveAdminTransaction(async ({ transaction }) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          transaction
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
      })
    })

    it('should not grant usage credits if the subscription is canceled due to a past cancelScheduledAt date', async () => {
      let canceledSub: Subscription.Record | null = null
      // setup:
      await adminTransaction(async ({ transaction }) => {
        await updateSubscription(
          {
            id: subscription.id,
            cancelScheduledAt: new Date(Date.now() - 1000),
            status: SubscriptionStatus.Active,
            renews: subscription.renews,
          },
          transaction
        )
      })

      // execution:
      const { subscription: updatedSub } =
        await comprehensiveAdminTransaction(async ({ transaction }) =>
          attemptToTransitionSubscriptionBillingPeriod(
            pastBillingPeriod,
            transaction
          )
        )
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
      })
    })

    it('should not grant usage credits if the subscription has no credit entitlements', async () => {
      // execution:
      await comprehensiveAdminTransaction(async ({ transaction }) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          transaction
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
        const productFeature = await setupProductFeature({
          organizationId: organization.id,
          productId: product.id,
          featureId: feature.id,
          livemode: true,
        })
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
      })

      // execution:
      const { subscription: updatedSub } =
        await comprehensiveAdminTransaction(async ({ transaction }) =>
          attemptToTransitionSubscriptionBillingPeriod(
            pastBillingPeriod,
            transaction
          )
        )
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
        expect(creditEntry).toBeDefined()
        expect(creditEntry?.amount).toBe(grantAmount)

        const balance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(balance).toBe(grantAmount)
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
        const productFeature1 = await setupProductFeature({
          organizationId: organization.id,
          productId: product.id,
          featureId: feature1.id,
          livemode: true,
        })
        const productFeature2 = await setupProductFeature({
          organizationId: organization.id,
          productId: product.id,
          featureId: feature2.id,
          livemode: true,
        })
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
      })

      // execution:
      await comprehensiveAdminTransaction(async ({ transaction }) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          transaction
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
        expect(creditEntry1).toBeDefined()

        const ledgerEntries2 = await selectLedgerEntries(
          { ledgerAccountId: otherLedgerAccount.id },
          transaction
        )
        const creditEntry2 = ledgerEntries2.find(
          (le) =>
            le.entryType === LedgerEntryType.CreditGrantRecognized &&
            le.amount === grantAmount2
        )
        expect(creditEntry2).toBeDefined()

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
        const productFeature = await setupProductFeature({
          organizationId: organization.id,
          productId: product.id,
          featureId: feature.id,
          livemode: true,
        })
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
      })

      // execution:
      await comprehensiveAdminTransaction(async ({ transaction }) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          transaction
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
        expect(creditEntry).toBeDefined()

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
        const productFeatureOnce = await setupProductFeature({
          organizationId: organization.id,
          productId: product.id,
          featureId: featureOnce.id,
          livemode: true,
        })
        const productFeatureEvery = await setupProductFeature({
          organizationId: organization.id,
          productId: product.id,
          featureId: featureEvery.id,
          livemode: true,
        })
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
      })

      // Action: Transition the billing period. Since pastBillingPeriod exists, this is a subsequent transition.
      await comprehensiveAdminTransaction(async ({ transaction }) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          transaction
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
        expect(newCredit).toBeDefined()
        expect(newCredit.issuedAmount).toBe(everyGrantAmount)
        expect(newCredit.usageMeterId).toBe(otherUsageMeter.id)
        expect(newCredit.expiresAt).toBeDefined() // Recurring grants should expire

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
      })
    })
  })

  describe('Credit Expiration Scenarios', () => {
    it('should expire a usage credit that has a balance and create a credit_grant_expired ledger entry', async () => {
      const expiringCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 500,
        usageMeterId: usageMeter.id,
        expiresAt: new Date(pastBillingPeriod.endDate),
        livemode: true,
      })
      const ledgerTx = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
      })
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
      await comprehensiveAdminTransaction(async ({ transaction }) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          transaction
        )
      )

      const expiredLedgerEntryResult = await adminTransaction(
        async ({ transaction }) => {
          return selectLedgerEntries(
            {
              sourceUsageCreditId: expiringCredit.id,
              entryType: LedgerEntryType.CreditGrantExpired,
            },
            transaction
          )
        }
      )
      const expiredLedgerEntry = expiredLedgerEntryResult.find(
        (le: LedgerEntry.Record) =>
          le.entryType === LedgerEntryType.CreditGrantExpired
      )

      expect(expiredLedgerEntry).toBeDefined()
      expect(expiredLedgerEntry!.amount).toBe(500)

      await adminTransaction(async ({ transaction }) => {
        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(finalBalance).toBe(0)
      })
    })

    it('should expire a usage credit that has a partial balance and create a credit_grant_expired ledger entry for the remaining balance', async () => {
      const expiringCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 1000,
        usageMeterId: usageMeter.id,
        expiresAt: new Date(pastBillingPeriod.endDate),
        livemode: true,
      })

      const grantTx = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
      })
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
      const creditApplication = await setupUsageCreditApplication({
        organizationId: organization.id,
        usageCreditId: expiringCredit.id,
        amountApplied: 400,
        usageEventId: usageEvent.id,
      })
      const usageTx = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.UsageEventProcessed,
      })
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

      await comprehensiveAdminTransaction(async ({ transaction }) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          transaction
        )
      )

      const ledgerEntries = await adminTransaction(
        async ({ transaction }) => {
          return selectLedgerEntries(
            {
              sourceUsageCreditId: expiringCredit.id,
            },
            transaction
          )
        }
      )

      const expiredLedgerEntry = ledgerEntries.find(
        (le: LedgerEntry.Record) =>
          le.entryType === LedgerEntryType.CreditGrantExpired
      )
      expect(expiredLedgerEntry).toBeDefined()
      expect(expiredLedgerEntry!.amount).toBe(600) // 1000 - 400

      await adminTransaction(async ({ transaction }) => {
        const finalBalance =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount.id },
            'available',
            transaction
          )
        expect(finalBalance).toBe(0)
      })
    })

    it('should not create a credit_grant_expired ledger entry for a usage credit with a zero balance', async () => {
      const expiringCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 1000,
        usageMeterId: usageMeter.id,
        expiresAt: new Date(pastBillingPeriod.endDate),
        livemode: true,
      })

      const grantTx = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
      })
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
      const creditApplication = await setupUsageCreditApplication({
        organizationId: organization.id,
        usageCreditId: expiringCredit.id,
        amountApplied: 1000,
        usageEventId: usageEvent.id,
      })
      const usageTx = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.UsageEventProcessed,
      })
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

      await comprehensiveAdminTransaction(async ({ transaction }) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          transaction
        )
      )

      const ledgerEntries = await adminTransaction(
        async ({ transaction }) => {
          return selectLedgerEntries(
            {
              sourceUsageCreditId: expiringCredit.id,
            },
            transaction
          )
        }
      )
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
      })
    })

    it('should not expire a usage credit that has a null expiresAt', async () => {
      const nonExpiringCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 700,
        usageMeterId: usageMeter.id,
        expiresAt: null, // This credit should not expire
        livemode: false,
      })

      const ledgerTx = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
      })
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

      await comprehensiveAdminTransaction(async ({ transaction }) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          transaction
        )
      )

      const ledgerEntries = await adminTransaction(
        async ({ transaction }) => {
          return selectLedgerEntries(
            {
              sourceUsageCreditId: nonExpiringCredit.id,
            },
            transaction
          )
        }
      )
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
      })
    })

    it('should not expire credits with a future expiration date', async () => {
      const futureCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 10000,
        usageMeterId: usageMeter.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        livemode: false,
      })

      const ledgerTx = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
      })
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

      await comprehensiveAdminTransaction(async ({ transaction }) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          transaction
        )
      )

      const ledgerEntries = await adminTransaction(
        async ({ transaction }) => {
          return selectLedgerEntries(
            {
              sourceUsageCreditId: futureCredit.id,
            },
            transaction
          )
        }
      )
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
      })
    })

    it('should correctly handle a mix of expiring and non-expiring credits', async () => {
      // Expiring credit with balance
      const expiringCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 100,
        usageMeterId: usageMeter.id,
        expiresAt: new Date(pastBillingPeriod.endDate),
        livemode: false,
      })
      const ledgerTx1 = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
      })
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
      const evergreenCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 200,
        usageMeterId: usageMeter.id,
        expiresAt: null,
        livemode: false,
      })
      const ledgerTx2 = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
      })
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
      const futureCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 300,
        usageMeterId: usageMeter.id,
        expiresAt: new Date(
          pastBillingPeriod.endDate.getTime() + 10000
        ), // Expires after transition
        livemode: false,
      })
      const ledgerTx3 = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
      })
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
      await comprehensiveAdminTransaction(async ({ transaction }) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          transaction
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
        expect(expiringEntry).toBeDefined()
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
      })
    })

    it('should handle expiring credits and new grant entitlements', async () => {
      // Setup:
      // 1. An expiring credit
      const expiringAmount = 150
      const expiringCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: expiringAmount,
        usageMeterId: usageMeter.id,
        expiresAt: new Date(pastBillingPeriod.endDate),
        livemode: true,
      })
      const expiringTx = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
      })
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
      const productFeature = await setupProductFeature({
        organizationId: organization.id,
        productId: product.id,
        featureId: feature.id,
        livemode: true,
      })
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
      await comprehensiveAdminTransaction(async ({ transaction }) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          transaction
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
        expect(newCredit).toBeDefined()

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
      })
    })

    it('should handle expiring credits, non-expiring credits, and new grant entitlements', async () => {
      // Setup:
      // 1. An expiring credit
      const expiringAmount = 100
      const expiringCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: expiringAmount,
        usageMeterId: usageMeter.id,
        expiresAt: new Date(pastBillingPeriod.endDate),
        livemode: true,
      })
      const expiringTx = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
      })
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
      const evergreenCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: evergreenAmount,
        usageMeterId: usageMeter.id,
        expiresAt: null,
        livemode: true,
      })
      const evergreenTx = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
      })
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
      const productFeature = await setupProductFeature({
        organizationId: organization.id,
        productId: product.id,
        featureId: feature.id,
        livemode: true,
      })
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
      await comprehensiveAdminTransaction(async ({ transaction }) =>
        attemptToTransitionSubscriptionBillingPeriod(
          pastBillingPeriod,
          transaction
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
      })
    })
  })
})
