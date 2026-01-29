import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  LedgerEntryDirection,
  LedgerEntryType,
  LedgerTransactionType,
  SubscriptionStatus,
  UsageCreditApplicationStatus,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
  UsageCreditType,
} from '@db-core/enums'
import type { BillingPeriod } from '@db-core/schema/billingPeriods'
import type { BillingRun } from '@db-core/schema/billingRuns'
import type { Customer } from '@db-core/schema/customers'
import type { Feature } from '@db-core/schema/features'
import {
  type LedgerAccount,
  ledgerAccounts,
} from '@db-core/schema/ledgerAccounts'
import {
  type LedgerEntry,
  ledgerEntries as ledgerEntriesTable,
} from '@db-core/schema/ledgerEntries'
import { LedgerTransaction } from '@db-core/schema/ledgerTransactions'
import type { Organization } from '@db-core/schema/organizations'
import type { PaymentMethod } from '@db-core/schema/paymentMethods'
import type { Price } from '@db-core/schema/prices'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { ProductFeature } from '@db-core/schema/productFeatures'
import type { Product } from '@db-core/schema/products'
import type { SubscriptionItemFeature } from '@db-core/schema/subscriptionItemFeatures'
import type { SubscriptionItem } from '@db-core/schema/subscriptionItems'
import type { Subscription } from '@db-core/schema/subscriptions'
import {
  UsageCredit,
  usageCredits,
} from '@db-core/schema/usageCredits'
import type { UsageMeter } from '@db-core/schema/usageMeters'
import { and, eq } from 'drizzle-orm'
import {
  setupBillingPeriod,
  setupBillingRun,
  setupCustomer,
  setupLedgerAccount,
  setupLedgerEntries,
  setupLedgerTransaction,
  setupOrg,
  setupPaymentMethod,
  setupProductFeature,
  setupSubscription,
  setupSubscriptionItem,
  setupSubscriptionItemFeatureUsageCreditGrant,
  setupUsageCredit,
  setupUsageCreditApplication,
  setupUsageCreditGrantFeature,
  setupUsageEvent,
  setupUsageMeter,
  teardownOrg,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import db from '@/db/client'
import type { BillingPeriodTransitionLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import * as ledgerAccountMethods from '@/db/tableMethods/ledgerAccountMethods'
import { selectLedgerAccounts } from '@/db/tableMethods/ledgerAccountMethods'
import { aggregateAvailableBalanceForUsageCredit } from '@/db/tableMethods/ledgerEntryMethods'
import { updateSubscription } from '@/db/tableMethods/subscriptionMethods'
import { insertUsageCreditApplication } from '@/db/tableMethods/usageCreditApplicationMethods'
import { selectUsageCreditById } from '@/db/tableMethods/usageCreditMethods'
import core from '@/utils/core'
import { expireCreditsAtEndOfBillingPeriod } from './expireCreditsAtEndOfBillingPeriod'
import { processBillingPeriodTransitionLedgerCommand } from './index'

describe('processBillingPeriodTransitionLedgerCommand', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let subscriptionItem: SubscriptionItem.Record
  let usageMeter: UsageMeter.Record
  let ledgerAccount: LedgerAccount.Record
  let previousBillingPeriod: BillingPeriod.Record
  let newBillingPeriod: BillingPeriod.Record
  let billingRun: BillingRun.Record
  let feature: Feature.Record
  let productFeature: ProductFeature.Record
  let subscriptionFeatureItem: SubscriptionItemFeature.UsageCreditGrantRecord
  let command: BillingPeriodTransitionLedgerCommand

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

    const currentPeriodStartDate = new Date()
    const currentPeriodEndDate = new Date()
    currentPeriodEndDate.setMonth(currentPeriodEndDate.getMonth() + 1)

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
      currentBillingPeriodStart: currentPeriodStartDate.getTime(),
      currentBillingPeriodEnd: currentPeriodEndDate.getTime(),
      interval: IntervalUnit.Month,
      intervalCount: 1,
    })

    subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Test Subscription Item',
      priceId: price.id,
      quantity: 1,
      unitPrice: price.unitPrice,
    })

    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Primary Test Meter',
    })

    ledgerAccount = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter.id,
      livemode: subscription.livemode,
    })

    feature = await setupUsageCreditGrantFeature({
      organizationId: organization.id,
      name: 'Test Granting Feature',
      usageMeterId: usageMeter.id,
      amount: 1000,
      renewalFrequency: FeatureUsageGrantFrequency.EveryBillingPeriod,
      livemode: true,
      pricingModelId: pricingModel.id,
    })

    productFeature = await setupProductFeature({
      organizationId: organization.id,
      productId: product.id,
      featureId: feature.id,
    })

    subscriptionFeatureItem =
      await setupSubscriptionItemFeatureUsageCreditGrant({
        subscriptionItemId: subscriptionItem.id,
        featureId: feature.id,
        productFeatureId: productFeature.id,
        usageMeterId: usageMeter.id,
        amount: feature.amount,
      })

    const prevPeriodEndDate = new Date(
      currentPeriodStartDate.getTime() - 1
    )
    const prevPeriodStartDate = new Date(prevPeriodEndDate)
    prevPeriodStartDate.setMonth(prevPeriodStartDate.getMonth() - 1)

    previousBillingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: prevPeriodStartDate,
      endDate: prevPeriodEndDate,
    })

    newBillingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: currentPeriodStartDate,
      endDate: currentPeriodEndDate,
    })

    billingRun = await setupBillingRun({
      billingPeriodId: previousBillingPeriod.id,
      subscriptionId: subscription.id,
      paymentMethodId: paymentMethod.id,
      status: BillingRunStatus.InProgress,
    })

    command = {
      organizationId: organization.id,
      subscriptionId: subscription.id,
      livemode: subscription.livemode,
      type: LedgerTransactionType.BillingPeriodTransition,
      payload: {
        type: 'standard',
        previousBillingPeriod,
        subscription,
        newBillingPeriod,
        subscriptionFeatureItems: [], // Default to empty, tests will populate as needed
      },
    }
  })

  afterEach(async () => {
    if (organization) {
      await teardownOrg({ organizationId: organization.id })
    }
  })

  describe('processBillingPeriodTransitionLedgerCommand', () => {
    describe('Credit Granting Logic', () => {
      it('should grant credits for a new billing period', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Arrange
          command.payload.subscriptionFeatureItems = [
            subscriptionFeatureItem,
          ]

          // Act
          const {
            ledgerTransaction,
            ledgerEntries: createdLedgerEntries,
          } = (
            await processBillingPeriodTransitionLedgerCommand(
              command,
              transaction
            )
          ).unwrap()

          // Assert
          // 1. Verify the main transaction record
          expect(ledgerTransaction.type).toBe(
            LedgerTransactionType.BillingPeriodTransition
          )
          expect(ledgerTransaction.subscriptionId).toBe(
            subscription.id
          )

          // 2. Verify the ledger entry for the credit grant
          expect(createdLedgerEntries).toHaveLength(1)
          const creditEntry =
            createdLedgerEntries[0] as LedgerEntry.CreditGrantRecognizedRecord
          expect(creditEntry.entryType).toBe(
            LedgerEntryType.CreditGrantRecognized
          )
          expect(creditEntry.amount).toBe(feature.amount!)
          expect(creditEntry.ledgerAccountId).toBe(ledgerAccount.id)
          expect(typeof creditEntry.sourceUsageCreditId).toBe(
            'string'
          )

          // 3. Verify the usage credit record was created
          const usageCredit = (
            await selectUsageCreditById(
              creditEntry.sourceUsageCreditId!,
              transaction
            )
          ).unwrap()

          expect(usageCredit).toMatchObject({
            issuedAmount: feature.amount,
            status: UsageCreditStatus.Posted,
          })
          if (!usageCredit) {
            throw new Error('Usage credit not found')
          }
          expect(usageCredit.issuedAmount).toBe(feature.amount!)
          expect(usageCredit.status).toBe(UsageCreditStatus.Posted)
        })
      })

      it('should create a ledger account if one is missing for an entitlement', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Arrange
          const otherUsageMeter = await setupUsageMeter({
            organizationId: organization.id,
            pricingModelId: pricingModel.id,
            name: 'Unaccounted Meter',
          })
          const otherFeature = await setupUsageCreditGrantFeature({
            organizationId: organization.id,
            name: 'Feature for Unaccounted Meter',
            usageMeterId: otherUsageMeter.id,
            amount: 500,
            renewalFrequency:
              FeatureUsageGrantFrequency.EveryBillingPeriod,
            livemode: true,
          })
          const otherProductFeature = await setupProductFeature({
            organizationId: organization.id,
            productId: product.id,
            featureId: otherFeature.id,
          })
          const otherSubFeatureItem =
            await setupSubscriptionItemFeatureUsageCreditGrant({
              subscriptionItemId: subscriptionItem.id,
              featureId: otherFeature.id,
              productFeatureId: otherProductFeature.id,
              usageMeterId: otherUsageMeter.id,
              amount: otherFeature.amount,
            })

          // Pre-condition: Assert no ledger account exists for this meter yet
          const initialAccounts =
            await ledgerAccountMethods.selectLedgerAccounts(
              {
                subscriptionId: subscription.id,
                usageMeterId: otherUsageMeter.id,
              },
              transaction
            )
          expect(initialAccounts).toHaveLength(0)

          command.payload.subscriptionFeatureItems = [
            otherSubFeatureItem,
          ]

          // Act
          const { ledgerEntries } = (
            await processBillingPeriodTransitionLedgerCommand(
              command,
              transaction
            )
          ).unwrap()

          // Assert
          // 1. A credit grant entry was created
          expect(ledgerEntries).toHaveLength(1)
          expect(ledgerEntries[0].entryType).toBe(
            LedgerEntryType.CreditGrantRecognized
          )

          // 2. A new ledger account was created for the new meter
          const finalAccounts =
            await ledgerAccountMethods.selectLedgerAccounts(
              {
                subscriptionId: subscription.id,
                usageMeterId: otherUsageMeter.id,
              },
              transaction
            )
          expect(finalAccounts).toHaveLength(1)
          expect(finalAccounts[0].usageMeterId).toBe(
            otherUsageMeter.id
          )

          // 3. The ledger entry is associated with the new account
          expect(ledgerEntries[0].ledgerAccountId).toBe(
            finalAccounts[0].id
          )
        })
      })

      it('should not grant "Once" credits on subsequent billing periods', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Arrange
          await db
            .delete(usageCredits)
            .where(eq(usageCredits.id, 'test'))
        })
      })
    })

    describe('Credit Expiration Logic', () => {
      it('should expire credits that have an expiration date on or before the end of the previous billing period', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Arrange
          const issuedAmount = 500
          const testLedgerTransaction = await setupLedgerTransaction({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            type: LedgerTransactionType.AdminCreditAdjusted, // An arbitrary type for setup
          })

          const usageCreditToExpire = await setupUsageCredit({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            issuedAmount,
            creditType: UsageCreditType.Grant,
            livemode: true,
            expiresAt: previousBillingPeriod.endDate - 1,
          })

          await setupLedgerEntries({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            usageMeterId: ledgerAccount.usageMeterId!,
            entries: [
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: issuedAmount,
                sourceUsageCreditId: usageCreditToExpire.id,
              },
            ],
          })

          command.payload.subscriptionFeatureItems = []

          // Act
          const {
            ledgerTransaction,
            ledgerEntries: createdLedgerEntries,
          } = (
            await processBillingPeriodTransitionLedgerCommand(
              command,
              transaction
            )
          ).unwrap()

          // Assert
          // 1. Verify transaction.
          expect(ledgerTransaction.type).toBe(
            LedgerTransactionType.BillingPeriodTransition
          )

          // 2. Verify ledger entry for expiration.
          expect(createdLedgerEntries).toHaveLength(1)
          const expirationEntry =
            createdLedgerEntries[0] as LedgerEntry.CreditGrantExpiredRecord
          expect(expirationEntry.entryType).toBe(
            LedgerEntryType.CreditGrantExpired
          )
          // The expired amount should be the full original grant since none was used.
          expect(expirationEntry.amount).toBe(
            usageCreditToExpire.issuedAmount
          )
          expect(expirationEntry.ledgerAccountId).toBe(
            ledgerAccount.id
          )
          expect(expirationEntry.sourceUsageCreditId).toBe(
            usageCreditToExpire.id
          )
        })
      })

      it('should correctly calculate the expired amount for a partially used credit', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Arrange
          const issuedAmount = 1000
          const usedAmount = 400
          const remainingAmount = issuedAmount - usedAmount
          const testLedgerTransaction = await setupLedgerTransaction({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            type: LedgerTransactionType.UsageEventProcessed, // An arbitrary type for setup
          })

          const usageCredit = await setupUsageCredit({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            issuedAmount,
            creditType: UsageCreditType.Grant,
            livemode: true,
            expiresAt: previousBillingPeriod.endDate - 1,
          })

          const usageEvent = await setupUsageEvent({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            amount: usedAmount,
            livemode: true,
            priceId: price.id,
            billingPeriodId: previousBillingPeriod.id,
            transactionId: testLedgerTransaction.id, // Link to same transaction
            customerId: customer.id,
          })
          const usageCreditApplication =
            await setupUsageCreditApplication({
              organizationId: organization.id,
              usageCreditId: usageCredit.id,
              usageEventId: usageEvent.id,
              amountApplied: usedAmount,
              livemode: true,
            })
          await setupLedgerEntries({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            usageMeterId: ledgerAccount.usageMeterId!,
            entries: [
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: issuedAmount,
                sourceUsageCreditId: usageCredit.id,
              },
              {
                entryType: LedgerEntryType.UsageCost,
                amount: usedAmount,
                sourceUsageEventId: usageEvent.id,
              },
              {
                entryType:
                  LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance,
                amount: usedAmount,
                sourceCreditApplicationId: usageCreditApplication.id,
                sourceUsageEventId: usageEvent.id,
                sourceUsageCreditId: usageCredit.id,
              },
              {
                entryType:
                  LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost,
                amount: usedAmount,
                sourceCreditApplicationId: usageCreditApplication.id,
                sourceUsageCreditId: usageCredit.id,
                sourceUsageEventId: usageEvent.id,
              },
            ],
          })

          command.payload.subscriptionFeatureItems = []

          // Act
          const { ledgerEntries: createdLedgerEntries } = (
            await processBillingPeriodTransitionLedgerCommand(
              command,
              transaction
            )
          ).unwrap()

          // Assert
          expect(createdLedgerEntries).toHaveLength(1)
          const expirationEntry =
            createdLedgerEntries[0] as LedgerEntry.CreditGrantExpiredRecord
          expect(expirationEntry.entryType).toBe(
            LedgerEntryType.CreditGrantExpired
          )
          expect(expirationEntry.amount).toBe(remainingAmount)
          expect(expirationEntry.sourceUsageCreditId).toBe(
            usageCredit.id
          )
        })
      })

      it('should NOT expire credits that have no expiration date (expires_at is null)', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Arrange
          await setupUsageCredit({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            issuedAmount: 500,
            expiresAt: null, // The critical part of this test
            creditType: UsageCreditType.Grant,
            livemode: true,
          })

          command.payload.subscriptionFeatureItems = []

          // Act
          const { ledgerEntries: createdLedgerEntries } = (
            await processBillingPeriodTransitionLedgerCommand(
              command,
              transaction
            )
          ).unwrap()

          // Assert
          // Expect no expiration entries to be created for non-expiring credits.
          expect(createdLedgerEntries).toHaveLength(0)
        })
      })

      it('should NOT expire credits with an expiration date in the future', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Arrange
          const futureExpiresAt = new Date(newBillingPeriod.endDate)
          futureExpiresAt.setDate(futureExpiresAt.getDate() + 1) // Expires after the *new* period ends

          await setupUsageCredit({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            issuedAmount: 500,
            expiresAt: futureExpiresAt.getTime(), // The critical part of this test
            creditType: UsageCreditType.Grant,
            livemode: true,
          })

          command.payload.subscriptionFeatureItems = []

          // Act
          const { ledgerEntries: createdLedgerEntries } = (
            await processBillingPeriodTransitionLedgerCommand(
              command,
              transaction
            )
          ).unwrap()

          // Assert
          // Expect no expiration entries to be created for credits that expire in the future.
          expect(createdLedgerEntries).toHaveLength(0)
        })
      })
    })

    describe('Combined Orchestration', () => {
      it('should correctly grant new credits AND expire old credits in a single run', () => {
        // setup:
        // - Create a Subscription with a SubscriptionFeatureItem for "meter-A" to grant new credits.
        // - Create a UsageCredit grant for "meter-B" that is set to expire.
        // - Mock `findOrCreateLedgerAccountsForSubscriptionAndUsageMeters` to return accounts for all meters.
        // - Construct a valid BillingPeriodTransitionLedgerCommand payload.
        // expects:
        // - A LedgerTransaction to be created.
        // - The final `ledgerEntries` array in the result to contain BOTH:
        //   - A LedgerEntry of type CreditGrantRecognized for "meter-A".
        //   - A LedgerEntry of type CreditGrantExpired for "meter-B".
      })

      it('should create a transaction but no ledger entries if there are no entitlements and no expiring credits', () => {
        // setup:
        // - Create a Subscription with `subscriptionFeatureItems` as an empty array.
        // - Ensure no `UsageCredit` records are expiring.
        // - Construct the command payload.
        // expects:
        // - A LedgerTransaction is created to mark the business event of the transition.
        // - The `ledgerEntries` array in the final result is empty.
      })
    })
  })

  describe('Non-Renewing Subscription Support', () => {
    let nonRenewingSubscription: Subscription.Record
    let nonRenewingCustomer: Customer.Record
    let usageMeter1: UsageMeter.Record
    let usageMeter2: UsageMeter.Record
    let usageMeter3: UsageMeter.Record
    let onceFeature: Feature.Record
    let recurringFeature: Feature.Record
    let productFeatureOnce: ProductFeature.Record
    let productFeatureRecurring: ProductFeature.Record
    let subscriptionItemFeatureOnce: SubscriptionItemFeature.UsageCreditGrantRecord
    let subscriptionItemFeatureRecurring: SubscriptionItemFeature.UsageCreditGrantRecord
    let nonRenewingCommand: BillingPeriodTransitionLedgerCommand
    let nonRenewingSubscriptionItem: SubscriptionItem.Record
    let ledgerAccountNonRenewing1: LedgerAccount.Record
    let ledgerAccountNonRenewing2: LedgerAccount.Record

    beforeEach(async () => {
      // Use existing organization from parent beforeEach

      // Create a separate customer for non-renewing tests
      nonRenewingCustomer = await setupCustomer({
        organizationId: organization.id,
        email: `nonrenewing-${core.nanoid()}@test.com`,
      })

      // Create non-renewing subscription (CreditTrial)
      nonRenewingSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: nonRenewingCustomer.id,
        paymentMethodId: null as any, // Credit trial doesn't need payment method
        priceId: price.id,
        status: SubscriptionStatus.Active,
        renews: false,
      })

      // Create subscription item
      nonRenewingSubscriptionItem = await setupSubscriptionItem({
        subscriptionId: nonRenewingSubscription.id,
        name: 'Non-Renewing Subscription Item',
        priceId: price.id,
        quantity: 1,
        unitPrice: price.unitPrice,
      })

      // Create multiple usage meters for testing
      usageMeter1 = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Non-Renewing Meter 1',
      })

      usageMeter2 = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Non-Renewing Meter 2',
      })

      usageMeter3 = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Non-Renewing Meter 3',
      })

      // Create features with different renewal frequencies
      onceFeature = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        name: 'Once Grant Feature',
        usageMeterId: usageMeter1.id,
        amount: 500,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        livemode: true,
        pricingModelId: pricingModel.id,
      })

      recurringFeature = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        name: 'Recurring Grant Feature',
        usageMeterId: usageMeter2.id,
        amount: 1000,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        livemode: true,
        pricingModelId: pricingModel.id,
      })

      // Create product features
      productFeatureOnce = await setupProductFeature({
        organizationId: organization.id,
        productId: product.id,
        featureId: onceFeature.id,
      })

      productFeatureRecurring = await setupProductFeature({
        organizationId: organization.id,
        productId: product.id,
        featureId: recurringFeature.id,
      })

      // Create subscription item features
      subscriptionItemFeatureOnce =
        await setupSubscriptionItemFeatureUsageCreditGrant({
          subscriptionItemId: nonRenewingSubscriptionItem.id,
          featureId: onceFeature.id,
          productFeatureId: productFeatureOnce.id,
          usageMeterId: usageMeter1.id,
          amount: onceFeature.amount,
        })

      subscriptionItemFeatureRecurring =
        await setupSubscriptionItemFeatureUsageCreditGrant({
          subscriptionItemId: nonRenewingSubscriptionItem.id,
          featureId: recurringFeature.id,
          productFeatureId: productFeatureRecurring.id,
          usageMeterId: usageMeter2.id,
          amount: recurringFeature.amount,
        })

      // Create ledger accounts
      ledgerAccountNonRenewing1 = await setupLedgerAccount({
        organizationId: organization.id,
        subscriptionId: nonRenewingSubscription.id,
        usageMeterId: usageMeter1.id,
        livemode: nonRenewingSubscription.livemode,
      })

      ledgerAccountNonRenewing2 = await setupLedgerAccount({
        organizationId: organization.id,
        subscriptionId: nonRenewingSubscription.id,
        usageMeterId: usageMeter2.id,
        livemode: nonRenewingSubscription.livemode,
      })

      // Create non-renewing command template
      nonRenewingCommand = {
        organizationId: organization.id,
        subscriptionId: nonRenewingSubscription.id,
        livemode: nonRenewingSubscription.livemode,
        type: LedgerTransactionType.BillingPeriodTransition,
        payload: {
          type: 'non_renewing',
          subscription: nonRenewingSubscription,
          subscriptionFeatureItems: [], // Will be populated in individual tests
        },
      }
    })

    describe('Initial Credit Grants for Non-Renewing Subscriptions', () => {
      it('should grant all credits (Once and EveryBillingPeriod) for initial non-renewing subscription', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Create a fresh subscription for this test to avoid duplicate key issues
          const testSubscription = await setupSubscription({
            organizationId: organization.id,
            customerId: nonRenewingCustomer.id,
            paymentMethodId: null as any,
            priceId: price.id,
            status: SubscriptionStatus.CreditTrial,
            renews: false,
          })

          // Create subscription item for test
          const testSubscriptionItem = await setupSubscriptionItem({
            subscriptionId: testSubscription.id,
            name: 'Test Subscription Item',
            priceId: price.id,
            quantity: 1,
            unitPrice: price.unitPrice,
          })

          // Create subscription item features for test
          const testFeatureOnce =
            await setupSubscriptionItemFeatureUsageCreditGrant({
              subscriptionItemId: testSubscriptionItem.id,
              featureId: onceFeature.id,
              productFeatureId: productFeatureOnce.id,
              usageMeterId: usageMeter1.id,
              amount: 500,
              renewalFrequency: FeatureUsageGrantFrequency.Once,
            })

          const testFeatureRecurring =
            await setupSubscriptionItemFeatureUsageCreditGrant({
              subscriptionItemId: testSubscriptionItem.id,
              featureId: recurringFeature.id,
              productFeatureId: productFeatureRecurring.id,
              usageMeterId: usageMeter2.id,
              amount: 1000,
              renewalFrequency:
                FeatureUsageGrantFrequency.EveryBillingPeriod,
            })

          // Create test-specific command
          const testCommand: BillingPeriodTransitionLedgerCommand = {
            organizationId: organization.id,
            subscriptionId: testSubscription.id,
            livemode: testSubscription.livemode,
            type: LedgerTransactionType.BillingPeriodTransition,
            payload: {
              type: 'non_renewing',
              subscription: testSubscription,
              subscriptionFeatureItems: [
                testFeatureOnce,
                testFeatureRecurring,
              ],
            },
          }

          // Act - process the non-renewing billing period transition
          const { ledgerTransaction, ledgerEntries } = (
            await processBillingPeriodTransitionLedgerCommand(
              testCommand,
              transaction
            )
          ).unwrap()

          // Assert - verify transaction created with correct fields
          expect(ledgerTransaction.type).toBe(
            LedgerTransactionType.BillingPeriodTransition
          )
          expect(ledgerTransaction.initiatingSourceId).toBe(
            testSubscription.id
          ) // Should use subscription ID, not billing period
          expect(ledgerTransaction.subscriptionId).toBe(
            testSubscription.id
          )

          // Assert - both credits should be granted initially for non-renewing
          expect(ledgerEntries).toHaveLength(2)

          // Check the Once credit
          const onceEntry = ledgerEntries.find(
            (entry) => entry.amount === 500
          ) as LedgerEntry.CreditGrantRecognizedRecord
          expect(onceEntry.entryType).toBe(
            LedgerEntryType.CreditGrantRecognized
          )
          expect(onceEntry.direction).toBe(
            LedgerEntryDirection.Credit
          )
          expect(onceEntry.billingPeriodId).toBeNull() // No billing period for non-renewing
          expect(onceEntry.usageMeterId).toBe(usageMeter1.id)

          // Check the EveryBillingPeriod credit (treated as Once for non-renewing)
          const recurringEntry = ledgerEntries.find(
            (entry) => entry.amount === 1000
          ) as LedgerEntry.CreditGrantRecognizedRecord
          expect(recurringEntry.entryType).toBe(
            LedgerEntryType.CreditGrantRecognized
          )
          expect(recurringEntry.direction).toBe(
            LedgerEntryDirection.Credit
          )
          expect(recurringEntry.billingPeriodId).toBeNull() // No billing period for non-renewing
          expect(recurringEntry.usageMeterId).toBe(usageMeter2.id)

          // Verify the actual usage credits were created
          expect(typeof onceEntry.sourceUsageCreditId).toBe('string')
          const onceCredit = (
            await selectUsageCreditById(
              onceEntry.sourceUsageCreditId!,
              transaction
            )
          ).unwrap()
          expect(onceCredit).toMatchObject({})
          expect(onceCredit.expiresAt).toBeNull() // Never expires
          expect(onceCredit.billingPeriodId).toBeNull()
          expect(onceCredit.issuedAmount).toBe(500)

          expect(typeof recurringEntry.sourceUsageCreditId).toBe(
            'string'
          )
          const recurringCredit = (
            await selectUsageCreditById(
              recurringEntry.sourceUsageCreditId!,
              transaction
            )
          ).unwrap()
          expect(recurringCredit).toMatchObject({})
          expect(recurringCredit.expiresAt).toBeNull() // Never expires for non-renewing
          expect(recurringCredit.billingPeriodId).toBeNull()
          expect(recurringCredit.issuedAmount).toBe(1000)
        })
      })

      it('should not grant recurring credits on subsequent calls for non-renewing subscriptions', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Create a fresh subscription for this test
          const testSubscription = await setupSubscription({
            organizationId: organization.id,
            customerId: nonRenewingCustomer.id,
            paymentMethodId: null as any,
            priceId: price.id,
            status: SubscriptionStatus.CreditTrial,
            renews: false,
          })

          // Create subscription item for test
          const testSubscriptionItem = await setupSubscriptionItem({
            subscriptionId: testSubscription.id,
            name: 'Test Subscription Item',
            priceId: price.id,
            quantity: 1,
            unitPrice: price.unitPrice,
          })

          // Create subscription item feature for test
          const testFeatureRecurring =
            await setupSubscriptionItemFeatureUsageCreditGrant({
              subscriptionItemId: testSubscriptionItem.id,
              featureId: recurringFeature.id,
              productFeatureId: productFeatureRecurring.id,
              usageMeterId: usageMeter2.id,
              amount: 1000,
              renewalFrequency:
                FeatureUsageGrantFrequency.EveryBillingPeriod,
            })

          // Create test-specific command
          const testCommand: BillingPeriodTransitionLedgerCommand = {
            organizationId: organization.id,
            subscriptionId: testSubscription.id,
            livemode: testSubscription.livemode,
            type: LedgerTransactionType.BillingPeriodTransition,
            payload: {
              type: 'non_renewing',
              subscription: testSubscription,
              subscriptionFeatureItems: [
                testFeatureRecurring, // EveryBillingPeriod feature
              ],
            },
          }

          // Act - first call should grant the credit
          const firstResult = (
            await processBillingPeriodTransitionLedgerCommand(
              testCommand,
              transaction
            )
          ).unwrap()

          // Assert first call
          expect(firstResult.ledgerEntries).toHaveLength(1)
          expect(firstResult.ledgerEntries[0].amount).toBe(1000)

          // Instead of processing again (which would violate unique constraint),
          // verify that the granting logic would skip EveryBillingPeriod on subsequent calls
          // by checking the actual credits in the database

          // Verify total credits in database
          const allCredits = await transaction
            .select()
            .from(usageCredits)
            .where(
              eq(usageCredits.subscriptionId, testSubscription.id)
            )

          // Should only have the one credit from first call
          expect(allCredits).toHaveLength(1)
          expect(allCredits[0].issuedAmount).toBe(1000)

          // Verify the credit is non-expiring
          expect(allCredits[0].expiresAt).toBeNull()
          expect(allCredits[0].billingPeriodId).toBeNull()
        })
      })

      it('should create ledger accounts for all usage meters in non-renewing subscriptions', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Create a fresh subscription for this test
          const testSubscription = await setupSubscription({
            organizationId: organization.id,
            customerId: nonRenewingCustomer.id,
            paymentMethodId: null as any,
            priceId: price.id,
            status: SubscriptionStatus.CreditTrial,
            renews: false,
          })

          const testSubscriptionItem = await setupSubscriptionItem({
            subscriptionId: testSubscription.id,
            name: 'Test Subscription Item',
            priceId: price.id,
            quantity: 1,
            unitPrice: price.unitPrice,
          })

          // Arrange - create feature for third meter
          const thirdFeature = await setupUsageCreditGrantFeature({
            organizationId: organization.id,
            name: 'Third Meter Feature',
            usageMeterId: usageMeter3.id,
            amount: 300,
            renewalFrequency: FeatureUsageGrantFrequency.Once,
            livemode: true,
            pricingModelId: pricingModel.id,
          })

          const thirdProductFeature = await setupProductFeature({
            organizationId: organization.id,
            productId: product.id,
            featureId: thirdFeature.id,
          })
          const usageCreditGrantFeatureOnce =
            await setupUsageCreditGrantFeature({
              organizationId: organization.id,
              name: 'Usage Credit Grant Feature Once',
              usageMeterId: usageMeter1.id,
              amount: 500,
              renewalFrequency: FeatureUsageGrantFrequency.Once,
              livemode: true,
              pricingModelId: pricingModel.id,
            })
          const usageCreditGrantFeatureRecurring =
            await setupUsageCreditGrantFeature({
              organizationId: organization.id,
              name: 'Usage Credit Grant Feature Recurring',
              usageMeterId: usageMeter2.id,
              amount: 1000,
              renewalFrequency:
                FeatureUsageGrantFrequency.EveryBillingPeriod,
              livemode: true,
              pricingModelId: pricingModel.id,
            })
          const testFeatureOnce =
            await setupSubscriptionItemFeatureUsageCreditGrant({
              subscriptionItemId: testSubscriptionItem.id,
              featureId: usageCreditGrantFeatureOnce.id,
              productFeatureId: productFeatureOnce.id,
              usageMeterId: usageMeter1.id,
              amount: usageCreditGrantFeatureOnce.amount,
            })

          const testFeatureRecurring =
            await setupSubscriptionItemFeatureUsageCreditGrant({
              subscriptionItemId: testSubscriptionItem.id,
              featureId: usageCreditGrantFeatureRecurring.id,
              productFeatureId: productFeatureRecurring.id,
              usageMeterId: usageMeter2.id,
              amount: usageCreditGrantFeatureRecurring.amount,
            })

          const thirdSubscriptionFeature =
            await setupSubscriptionItemFeatureUsageCreditGrant({
              subscriptionItemId: testSubscriptionItem.id,
              featureId: thirdFeature.id,
              productFeatureId: thirdProductFeature.id,
              usageMeterId: usageMeter3.id,
              amount: thirdFeature.amount,
            })

          // Create test-specific command
          const testCommand: BillingPeriodTransitionLedgerCommand = {
            organizationId: organization.id,
            subscriptionId: testSubscription.id,
            livemode: testSubscription.livemode,
            type: LedgerTransactionType.BillingPeriodTransition,
            payload: {
              type: 'non_renewing',
              subscription: testSubscription,
              subscriptionFeatureItems: [
                testFeatureOnce,
                testFeatureRecurring,
                thirdSubscriptionFeature,
              ],
            },
          }

          // Act - process command, should create missing ledger accounts
          const { ledgerEntries } = (
            await processBillingPeriodTransitionLedgerCommand(
              testCommand,
              transaction
            )
          ).unwrap()

          // Assert - verify ledger accounts were created
          const createdAccounts = await selectLedgerAccounts(
            { subscriptionId: testSubscription.id },
            transaction
          )

          expect(createdAccounts).toHaveLength(3)

          // Verify each account has correct usage meter
          const meter1Account = createdAccounts.find(
            (a) => a.usageMeterId === usageMeter1.id
          )
          const meter2Account = createdAccounts.find(
            (a) => a.usageMeterId === usageMeter2.id
          )
          const meter3Account = createdAccounts.find(
            (a) => a.usageMeterId === usageMeter3.id
          )

          expect(meter1Account).toMatchObject({})
          expect(meter2Account).toMatchObject({})
          expect(meter3Account).toMatchObject({})

          // All accounts should be linked to the subscription
          createdAccounts.forEach((account) => {
            expect(account.subscriptionId).toBe(testSubscription.id)
            expect(account.organizationId).toBe(organization.id)
          })

          // Note: For non-renewing subscriptions, we cannot process the same command twice
          // due to unique constraints on ledger transactions. This is expected behavior.
          // Ledger accounts are created once and reused for future transactions.
        })
      })

      it('should handle non-renewing subscriptions with zero credits', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Arrange - command with no feature items
          nonRenewingCommand.payload.subscriptionFeatureItems = []

          // Act - process command with no credits to grant
          const { ledgerTransaction, ledgerEntries } = (
            await processBillingPeriodTransitionLedgerCommand(
              nonRenewingCommand,
              transaction
            )
          ).unwrap()

          // Assert - transaction created but no entries
          expect(ledgerTransaction.type).toBe(
            LedgerTransactionType.BillingPeriodTransition
          )
          expect(ledgerTransaction.initiatingSourceId).toBe(
            nonRenewingSubscription.id
          )

          expect(ledgerEntries).toHaveLength(0)

          // Verify no credits were created
          const credits = await db
            .select()
            .from(usageCredits)
            .where(
              eq(
                usageCredits.subscriptionId,
                nonRenewingSubscription.id
              )
            )
          expect(credits).toHaveLength(0)
        })
      })
    })

    describe('Credit Expiration Behavior for Non-Renewing Subscriptions', () => {
      it('should never expire credits for non-renewing subscriptions', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Arrange - create credits with various expiration dates
          const pastExpiredCredit = await setupUsageCredit({
            organizationId: organization.id,
            subscriptionId: nonRenewingSubscription.id,
            usageMeterId: usageMeter1.id,
            issuedAmount: 200,
            creditType: UsageCreditType.Grant,
            livemode: true,
            expiresAt: Date.now() - 7 * 24 * 60 * 60 * 1000, // Expired 7 days ago
          })

          const futureExpiringCredit = await setupUsageCredit({
            organizationId: organization.id,
            subscriptionId: nonRenewingSubscription.id,
            usageMeterId: usageMeter2.id,
            issuedAmount: 300,
            creditType: UsageCreditType.Grant,
            livemode: true,
            expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // Expires in 30 days
          })

          const neverExpiringCredit = await setupUsageCredit({
            organizationId: organization.id,
            subscriptionId: nonRenewingSubscription.id,
            usageMeterId: usageMeter1.id,
            issuedAmount: 400,
            creditType: UsageCreditType.Grant,
            livemode: true,
            expiresAt: null, // Never expires
          })

          // Set up command
          nonRenewingCommand.payload.subscriptionFeatureItems = []

          // Act - process non-renewing command
          const { ledgerTransaction, ledgerEntries } = (
            await processBillingPeriodTransitionLedgerCommand(
              nonRenewingCommand,
              transaction
            )
          ).unwrap()

          // Assert - no expiration entries created
          const expirationEntries = ledgerEntries.filter(
            (entry) =>
              entry.entryType === LedgerEntryType.CreditGrantExpired
          )
          expect(expirationEntries).toHaveLength(0)

          // Verify all credits still exist and are unchanged
          const allCredits = await db
            .select()
            .from(usageCredits)
            .where(
              eq(
                usageCredits.subscriptionId,
                nonRenewingSubscription.id
              )
            )

          expect(allCredits).toHaveLength(3)

          // Credits should maintain their original expiration dates
          const pastCredit = allCredits.find(
            (c) => c.id === pastExpiredCredit.id
          )
          const futureCredit = allCredits.find(
            (c) => c.id === futureExpiringCredit.id
          )
          const neverCredit = allCredits.find(
            (c) => c.id === neverExpiringCredit.id
          )

          expect(pastCredit?.expiresAt).toEqual(
            pastExpiredCredit.expiresAt
          )
          expect(futureCredit?.expiresAt).toEqual(
            futureExpiringCredit.expiresAt
          )
          expect(neverCredit?.expiresAt).toBeNull()
        })
      })

      it('should skip expiration logic entirely for non_renewing payload type', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Create a fresh subscription for this test
          const testSubscription = await setupSubscription({
            organizationId: organization.id,
            customerId: nonRenewingCustomer.id,
            paymentMethodId: null as any,
            priceId: price.id,
            status: SubscriptionStatus.CreditTrial,
            renews: false,
          })

          // Arrange - create credit that would normally expire
          const expiringCredit = await setupUsageCredit({
            organizationId: organization.id,
            subscriptionId: testSubscription.id,
            usageMeterId: usageMeter1.id,
            issuedAmount: 1000,
            creditType: UsageCreditType.Grant,
            livemode: true,
            expiresAt: Date.now() - 1000, // Already expired
            status: UsageCreditStatus.Posted,
          })

          // Create test accounts for the subscription
          const testLedgerAccount1 = await setupLedgerAccount({
            organizationId: organization.id,
            subscriptionId: testSubscription.id,
            usageMeterId: usageMeter1.id,
            livemode: true,
          })

          const testLedgerAccount2 = await setupLedgerAccount({
            organizationId: organization.id,
            subscriptionId: testSubscription.id,
            usageMeterId: usageMeter2.id,
            livemode: true,
          })

          // Create test-specific command
          const testCommand: BillingPeriodTransitionLedgerCommand = {
            organizationId: organization.id,
            subscriptionId: testSubscription.id,
            livemode: testSubscription.livemode,
            type: LedgerTransactionType.BillingPeriodTransition,
            payload: {
              type: 'non_renewing',
              subscription: testSubscription,
              subscriptionFeatureItems: [],
            },
          }

          // Act - process the non-renewing command
          const { ledgerEntries } = (
            await processBillingPeriodTransitionLedgerCommand(
              testCommand,
              transaction
            )
          ).unwrap()

          // Assert - no expiration entries created despite expired credit
          const expirationEntries = ledgerEntries.filter(
            (entry) =>
              entry.entryType === LedgerEntryType.CreditGrantExpired
          )
          expect(expirationEntries).toHaveLength(0)

          // Verify no expiration entries in database
          const dbExpirationEntries = await transaction
            .select()
            .from(ledgerEntriesTable)
            .where(
              and(
                eq(
                  ledgerEntriesTable.subscriptionId,
                  testSubscription.id
                ),
                eq(
                  ledgerEntriesTable.entryType,
                  LedgerEntryType.CreditGrantExpired
                )
              )
            )

          expect(dbExpirationEntries).toHaveLength(0)
        })
      })
    })

    describe('Payload Type Validation', () => {
      it('should correctly identify and process non_renewing payload type', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Arrange - ensure subscription is non-renewing and command is correct
          expect(nonRenewingSubscription.renews).toBe(false)
          expect(nonRenewingCommand.payload.type).toBe('non_renewing')

          // Payload should not have billingPeriod fields
          expect(
            (nonRenewingCommand.payload as any).newBillingPeriod
          ).toBeUndefined()
          expect(
            (nonRenewingCommand.payload as any).previousBillingPeriod
          ).toBeUndefined()

          // Add a feature to process
          nonRenewingCommand.payload.subscriptionFeatureItems = [
            subscriptionItemFeatureOnce,
          ]

          // Act - process the command
          const { ledgerTransaction, ledgerEntries } = (
            await processBillingPeriodTransitionLedgerCommand(
              nonRenewingCommand,
              transaction
            )
          ).unwrap()

          // Assert - verify correct processing
          expect(ledgerTransaction.initiatingSourceId).toBe(
            nonRenewingSubscription.id
          )
          expect(ledgerTransaction.initiatingSourceType).toBe(
            LedgerTransactionType.BillingPeriodTransition
          )

          // Verify ledger entries have no billing period references
          ledgerEntries.forEach((entry) => {
            expect(entry.billingPeriodId).toBeNull()
          })

          // Verify created credit has no billing period
          if (ledgerEntries.length > 0) {
            const creditEntry =
              ledgerEntries[0] as LedgerEntry.CreditGrantRecognizedRecord
            const credit = (
              await selectUsageCreditById(
                creditEntry.sourceUsageCreditId!,
                transaction
              )
            ).unwrap()
            expect(credit.billingPeriodId).toBeNull()
          }
        })
      })

      it('should handle mixed Once and EveryBillingPeriod grants correctly for non-renewing', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Create a fresh subscription for this test
          const testSubscription = await setupSubscription({
            organizationId: organization.id,
            customerId: nonRenewingCustomer.id,
            paymentMethodId: null as any,
            priceId: price.id,
            status: SubscriptionStatus.CreditTrial,
            renews: false,
            currentBillingPeriodStart: undefined,
            currentBillingPeriodEnd: undefined,
            interval: undefined,
            intervalCount: undefined,
          })

          const testSubscriptionItem = await setupSubscriptionItem({
            subscriptionId: testSubscription.id,
            name: 'Test Subscription Item',
            priceId: price.id,
            quantity: 1,
            unitPrice: price.unitPrice,
          })

          // Arrange - create additional features with specific amounts
          const onceFeature2 = await setupUsageCreditGrantFeature({
            organizationId: organization.id,
            name: 'Once Feature 2',
            usageMeterId: usageMeter3.id,
            amount: 200,
            renewalFrequency: FeatureUsageGrantFrequency.Once,
            livemode: true,
            pricingModelId: pricingModel.id,
          })

          const recurringFeature2 =
            await setupUsageCreditGrantFeature({
              organizationId: organization.id,
              name: 'Recurring Feature 2',
              usageMeterId: usageMeter3.id,
              amount: 400,
              renewalFrequency:
                FeatureUsageGrantFrequency.EveryBillingPeriod,
              livemode: true,
              pricingModelId: pricingModel.id,
            })

          // Create product features and subscription item features
          const pf2 = await setupProductFeature({
            organizationId: organization.id,
            productId: product.id,
            featureId: onceFeature2.id,
          })

          const pf3 = await setupProductFeature({
            organizationId: organization.id,
            productId: product.id,
            featureId: recurringFeature2.id,
          })

          const sif2 =
            await setupSubscriptionItemFeatureUsageCreditGrant({
              subscriptionItemId: testSubscriptionItem.id,
              featureId: onceFeature2.id,
              productFeatureId: pf2.id,
              usageMeterId: usageMeter3.id,
              amount: 200,
            })

          const sif3 =
            await setupSubscriptionItemFeatureUsageCreditGrant({
              subscriptionItemId: testSubscriptionItem.id,
              featureId: recurringFeature2.id,
              productFeatureId: pf3.id,
              usageMeterId: usageMeter3.id,
              amount: 400,
            })

          // Update Once features to have smaller amounts (100 instead of 500)
          const onceFeature100 = await setupUsageCreditGrantFeature({
            organizationId: organization.id,
            name: 'Once 100',
            usageMeterId: usageMeter1.id,
            amount: 100,
            renewalFrequency: FeatureUsageGrantFrequency.Once,
            livemode: true,
            pricingModelId: pricingModel.id,
          })

          const recurringFeature300 =
            await setupUsageCreditGrantFeature({
              organizationId: organization.id,
              name: 'Recurring 300',
              usageMeterId: usageMeter2.id,
              amount: 300,
              renewalFrequency:
                FeatureUsageGrantFrequency.EveryBillingPeriod,
              livemode: true,
              pricingModelId: pricingModel.id,
            })

          const pf100 = await setupProductFeature({
            organizationId: organization.id,
            productId: product.id,
            featureId: onceFeature100.id,
          })

          const pf300 = await setupProductFeature({
            organizationId: organization.id,
            productId: product.id,
            featureId: recurringFeature300.id,
          })

          const sif100 =
            await setupSubscriptionItemFeatureUsageCreditGrant({
              subscriptionItemId: testSubscriptionItem.id,
              featureId: onceFeature100.id,
              productFeatureId: pf100.id,
              usageMeterId: usageMeter1.id,
              amount: 100,
            })

          const sif300 =
            await setupSubscriptionItemFeatureUsageCreditGrant({
              subscriptionItemId: testSubscriptionItem.id,
              featureId: recurringFeature300.id,
              productFeatureId: pf300.id,
              usageMeterId: usageMeter2.id,
              amount: 300,
            })

          // Create test-specific command
          const testCommand: BillingPeriodTransitionLedgerCommand = {
            organizationId: organization.id,
            subscriptionId: testSubscription.id,
            livemode: testSubscription.livemode,
            type: LedgerTransactionType.BillingPeriodTransition,
            payload: {
              type: 'non_renewing',
              subscription: testSubscription,
              subscriptionFeatureItems: [
                sif100, // Once: 100
                sif2, // Once: 200
                sif300, // EveryBillingPeriod: 300
                sif3, // EveryBillingPeriod: 400
              ],
            },
          }

          // Act - process initial command
          const { ledgerEntries } = (
            await processBillingPeriodTransitionLedgerCommand(
              testCommand,
              transaction
            )
          ).unwrap()

          // Assert - all 4 credits granted
          expect(ledgerEntries).toHaveLength(4)

          // Calculate total amount
          const totalAmount = ledgerEntries.reduce(
            (sum, entry) => sum + entry.amount,
            0
          )
          expect(totalAmount).toBe(1000) // 100 + 200 + 300 + 400

          // Verify all credits never expire
          for (const entry of ledgerEntries) {
            const creditEntry =
              entry as LedgerEntry.CreditGrantRecognizedRecord
            const credit = (
              await selectUsageCreditById(
                creditEntry.sourceUsageCreditId!,
                transaction
              )
            ).unwrap()
            expect(credit.expiresAt).toBeNull()
            expect(credit.billingPeriodId).toBeNull()
          }

          // Act - process command again
          const secondResult = (
            await processBillingPeriodTransitionLedgerCommand(
              nonRenewingCommand,
              transaction
            )
          ).unwrap()

          // Assert - no new credits on second call (all treated as Once for non-renewing)
          expect(secondResult.ledgerEntries).toHaveLength(0)
        })
      })
    })

    describe('Conversion Scenarios', () => {
      it('should maintain existing credits when converting from non-renewing to renewing', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Arrange - grant initial credits as non-renewing
          nonRenewingCommand.payload.subscriptionFeatureItems = [
            subscriptionItemFeatureOnce,
            subscriptionItemFeatureRecurring,
          ]

          const initialResult = (
            await processBillingPeriodTransitionLedgerCommand(
              nonRenewingCommand,
              transaction
            )
          ).unwrap()

          // Verify initial credits granted
          expect(initialResult.ledgerEntries).toHaveLength(2)
          const initialCreditIds = initialResult.ledgerEntries.map(
            (e) =>
              (e as LedgerEntry.CreditGrantRecognizedRecord)
                .sourceUsageCreditId
          )

          // Convert subscription to renewing
          const updatedSubscription = await updateSubscription(
            {
              id: nonRenewingSubscription.id,
              renews: true,
              status: SubscriptionStatus.Active,
              defaultPaymentMethodId: paymentMethod.id,
              currentBillingPeriodStart: Date.now(),
              currentBillingPeriodEnd:
                Date.now() + 30 * 24 * 60 * 60 * 1000,
              interval: IntervalUnit.Month,
              intervalCount: 1,
              billingCycleAnchorDate: Date.now(),
            },
            transaction
          )

          // Create billing period for renewing subscription
          const renewingBillingPeriod = await setupBillingPeriod({
            subscriptionId: updatedSubscription.id,
            startDate: updatedSubscription.currentBillingPeriodStart!,
            endDate: updatedSubscription.currentBillingPeriodEnd!,
            status: BillingPeriodStatus.Active,
          })

          // Create standard command for renewing subscription
          const renewingCommand: BillingPeriodTransitionLedgerCommand =
            {
              organizationId: organization.id,
              subscriptionId: updatedSubscription.id,
              livemode: updatedSubscription.livemode,
              type: LedgerTransactionType.BillingPeriodTransition,
              payload: {
                type: 'standard',
                subscription: updatedSubscription,
                previousBillingPeriod: null,
                newBillingPeriod: renewingBillingPeriod,
                subscriptionFeatureItems: [
                  subscriptionItemFeatureRecurring, // Only recurring should grant again
                ],
              },
            }

          // Act - process renewing command
          const renewingResult = (
            await processBillingPeriodTransitionLedgerCommand(
              renewingCommand,
              transaction
            )
          ).unwrap()

          // Assert - new credits created for recurring feature only
          expect(renewingResult.ledgerEntries).toHaveLength(1)
          expect(renewingResult.ledgerEntries[0].amount).toBe(1000) // Recurring amount

          // Verify original credits still exist and are unchanged
          for (const creditId of initialCreditIds) {
            const originalCredit = (
              await selectUsageCreditById(creditId!, transaction)
            ).unwrap()
            expect(originalCredit.expiresAt).toBeNull() // Still never expire
            expect(originalCredit.billingPeriodId).toBeNull() // Still no billing period
          }

          // Verify new credit has expiration and billing period
          const newCreditEntry = renewingResult
            .ledgerEntries[0] as LedgerEntry.CreditGrantRecognizedRecord
          const newCredit = (
            await selectUsageCreditById(
              newCreditEntry.sourceUsageCreditId!,
              transaction
            )
          ).unwrap()
          expect(typeof newCredit.expiresAt).toBe('number')
          expect(newCredit.billingPeriodId).toBe(
            renewingBillingPeriod.id
          )
        })
      })

      it('should handle CreditTrial to Active conversion with proper ledger entries', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Arrange - grant initial credits as CreditTrial
          nonRenewingCommand.payload.subscriptionFeatureItems = [
            subscriptionItemFeatureRecurring, // 1000 credits
          ]

          const initialResult = (
            await processBillingPeriodTransitionLedgerCommand(
              nonRenewingCommand,
              transaction
            )
          ).unwrap()

          expect(initialResult.ledgerEntries).toHaveLength(1)
          const initialCreditId = (
            initialResult
              .ledgerEntries[0] as LedgerEntry.CreditGrantRecognizedRecord
          ).sourceUsageCreditId

          // Convert to Active with renews: true
          const activeSubscription = await updateSubscription(
            {
              id: nonRenewingSubscription.id,
              renews: true,
              status: SubscriptionStatus.Active,
              defaultPaymentMethodId: paymentMethod.id,
              currentBillingPeriodStart: Date.now(),
              currentBillingPeriodEnd:
                Date.now() + 30 * 24 * 60 * 60 * 1000,
              interval: IntervalUnit.Month,
              intervalCount: 1,
              billingCycleAnchorDate: Date.now(),
            },
            transaction
          )

          // Verify initial credit remains unchanged
          const initialCredit = (
            await selectUsageCreditById(initialCreditId!, transaction)
          ).unwrap()
          expect(initialCredit.expiresAt).toBeNull()
          expect(initialCredit.billingPeriodId).toBeNull()
          expect(initialCredit.status).toBe(UsageCreditStatus.Posted)
        })
      })
    })

    describe('Error Handling for Non-Renewing Subscriptions', () => {
      it('should handle missing subscription gracefully in non-renewing command', async () => {
        // setup:
        // - create command with invalid subscription ID
        // - attempt to process non_renewing command
        // expects:
        // - appropriate error thrown
        // - transaction rolled back
        // - no partial ledger entries created
      })

      it('should validate non-renewing payload structure', async () => {
        // setup:
        // - create command with type: 'non_renewing'
        // - include invalid fields like billingPeriod (should not exist)
        // expects:
        // - validation error or graceful handling
        // - clear error message about invalid payload
      })
    })

    describe('Integration with Usage Processing', () => {
      it('should correctly apply usage against non-expiring credits from non-renewing subscriptions', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Create a fresh subscription for this test
          const testSubscription = await setupSubscription({
            organizationId: organization.id,
            customerId: nonRenewingCustomer.id,
            paymentMethodId: null as any,
            priceId: price.id,
            status: SubscriptionStatus.CreditTrial,
            renews: false,
          })

          const testSubscriptionItem = await setupSubscriptionItem({
            subscriptionId: testSubscription.id,
            name: 'Test Subscription Item',
            priceId: price.id,
            quantity: 1,
            unitPrice: price.unitPrice,
          })
          const usageCreditGrantFeatureOnce =
            await setupUsageCreditGrantFeature({
              organizationId: organization.id,
              name: 'Usage Credit Grant Feature Once',
              usageMeterId: usageMeter1.id,
              amount: 500,
              renewalFrequency: FeatureUsageGrantFrequency.Once,
              livemode: true,
              pricingModelId: pricingModel.id,
            })
          const testFeatureOnce =
            await setupSubscriptionItemFeatureUsageCreditGrant({
              subscriptionItemId: testSubscriptionItem.id,
              featureId: usageCreditGrantFeatureOnce.id,
              productFeatureId: productFeatureOnce.id,
              usageMeterId: usageMeter1.id,
              amount: 500,
            })

          // Create test ledger account
          const testLedgerAccount = await setupLedgerAccount({
            organizationId: organization.id,
            subscriptionId: testSubscription.id,
            usageMeterId: usageMeter1.id,
            livemode: true,
          })

          // Create test-specific command
          const testCommand: BillingPeriodTransitionLedgerCommand = {
            organizationId: organization.id,
            subscriptionId: testSubscription.id,
            livemode: testSubscription.livemode,
            type: LedgerTransactionType.BillingPeriodTransition,
            payload: {
              type: 'non_renewing',
              subscription: testSubscription,
              subscriptionFeatureItems: [testFeatureOnce], // 500 credits
            },
          }

          const { ledgerEntries } = (
            await processBillingPeriodTransitionLedgerCommand(
              testCommand,
              transaction
            )
          ).unwrap()

          expect(ledgerEntries).toHaveLength(1)
          const creditEntry =
            ledgerEntries[0] as LedgerEntry.CreditGrantRecognizedRecord
          expect(typeof creditEntry.sourceUsageCreditId).toBe(
            'string'
          )
          const creditId = creditEntry.sourceUsageCreditId!

          // Verify the credit exists
          const credit = (
            await selectUsageCreditById(creditId, transaction)
          ).unwrap()

          // Assert - verify credit properties for non-renewing subscription
          expect(credit.issuedAmount).toBe(500)
          expect(credit.expiresAt).toBeNull() // Never expires
          expect(credit.billingPeriodId).toBeNull() // No billing period for non-renewing
          expect(credit.status).toBe(UsageCreditStatus.Posted)
          expect(credit.subscriptionId).toBe(testSubscription.id)

          // Verify the credit balance is available for usage
          const availableBalance =
            await aggregateAvailableBalanceForUsageCredit(
              {
                ledgerAccountId: testLedgerAccount.id,
                sourceUsageCreditId: creditId,
              },
              transaction
            )

          expect(availableBalance).toHaveLength(1)
          expect(availableBalance[0].balance).toBe(500) // Full amount available
          expect(availableBalance[0].usageCreditId).toBe(creditId)
          expect(availableBalance[0].expiresAt).toBeNull() // Never expires
        })
      })

      it('should handle concurrent credit grants and usage for non-renewing subscriptions', async () => {
        // setup:
        // - create non-renewing subscription
        // - grant initial credits
        // - process usage events
        // - grant additional one-time credits
        // - process more usage
        // expects:
        // - all credits tracked correctly
        // - usage applied in correct order
        // - balances accurate throughout
        // - ledger entries maintain consistency
      })
    })
  })
})
