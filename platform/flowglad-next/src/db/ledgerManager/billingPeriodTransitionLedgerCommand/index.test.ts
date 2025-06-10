import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest'
import { processBillingPeriodTransitionLedgerCommand } from './index'
import {
  LedgerEntryType,
  LedgerTransactionType,
  SubscriptionStatus,
  IntervalUnit,
  BillingRunStatus,
  FeatureUsageGrantFrequency,
  UsageCreditStatus,
  UsageCreditType,
  LedgerEntryDirection,
  UsageCreditSourceReferenceType,
} from '@/types'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupUsageMeter,
  setupLedgerAccount,
  setupBillingPeriod,
  teardownOrg,
  setupBillingRun,
  setupSubscriptionItem,
  setupUsageCreditGrantFeature,
  setupProductFeature,
  setupSubscriptionItemFeatureUsageCreditGrant,
  setupUsageCredit,
  setupUsageCreditApplication,
  setupUsageEvent,
  setupLedgerEntries,
  setupLedgerTransaction,
} from '@/../seedDatabase'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { Customer } from '@/db/schema/customers'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { UsageMeter } from '@/db/schema/usageMeters'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { Catalog } from '@/db/schema/catalogs'
import { adminTransaction } from '@/db/adminTransaction'
import { LedgerAccount } from '@/db/schema/ledgerAccounts'
import { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import { BillingPeriodTransitionLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import { BillingRun } from '@/db/schema/billingRuns'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { Feature } from '@/db/schema/features'
import { ProductFeature } from '@/db/schema/productFeatures'
import { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import { eq } from 'drizzle-orm'
import db from '@/db/client'
import { ledgerEntries } from '@/db/schema/ledgerEntries'
import { usageCredits, UsageCredit } from '@/db/schema/usageCredits'
import { LedgerEntry } from '@/db/schema/ledgerEntries'
import { selectUsageCreditById } from '@/db/tableMethods/usageCreditMethods'
import * as ledgerAccountMethods from '@/db/tableMethods/ledgerAccountMethods'

describe('processBillingPeriodTransitionLedgerCommand', () => {
  let organization: Organization.Record
  let catalog: Catalog.Record
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
  let subscriptionFeatureItem: SubscriptionItemFeature.UsageCreditGrantClientRecord
  let command: BillingPeriodTransitionLedgerCommand

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    catalog = orgData.catalog
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
      currentBillingPeriodStart: currentPeriodStartDate,
      currentBillingPeriodEnd: currentPeriodEndDate,
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
      catalogId: catalog.id,
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
          } = await processBillingPeriodTransitionLedgerCommand(
            command,
            transaction
          )

          // Assert
          // 1. Verify the main transaction record
          expect(ledgerTransaction).toBeDefined()
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
          expect(creditEntry.amount).toBe(feature.amount)
          expect(creditEntry.ledgerAccountId).toBe(ledgerAccount.id)
          expect(creditEntry.sourceUsageCreditId).not.toBeNull()

          // 3. Verify the usage credit record was created
          const usageCredit = await selectUsageCreditById(
            creditEntry.sourceUsageCreditId!,
            transaction
          )

          expect(usageCredit).toBeDefined()
          if (!usageCredit) {
            throw new Error('Usage credit not found')
          }
          expect(usageCredit.issuedAmount).toBe(feature.amount)
          expect(usageCredit.status).toBe(UsageCreditStatus.Posted)
        })
      })

      it('should create a ledger account if one is missing for an entitlement', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Arrange
          const otherUsageMeter = await setupUsageMeter({
            organizationId: organization.id,
            catalogId: catalog.id,
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
          const { ledgerEntries } =
            await processBillingPeriodTransitionLedgerCommand(
              command,
              transaction
            )

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
            expiresAt: new Date(
              previousBillingPeriod.endDate.getTime() - 1
            ),
          })

          await setupLedgerEntries({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
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
          } = await processBillingPeriodTransitionLedgerCommand(
            command,
            transaction
          )

          // Assert
          // 1. Verify transaction.
          expect(ledgerTransaction).toBeDefined()

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
            expiresAt: new Date(
              previousBillingPeriod.endDate.getTime() - 1
            ),
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
          const { ledgerEntries: createdLedgerEntries } =
            await processBillingPeriodTransitionLedgerCommand(
              command,
              transaction
            )

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
          const { ledgerEntries: createdLedgerEntries } =
            await processBillingPeriodTransitionLedgerCommand(
              command,
              transaction
            )

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
            expiresAt: futureExpiresAt, // The critical part of this test
            creditType: UsageCreditType.Grant,
            livemode: true,
          })

          command.payload.subscriptionFeatureItems = []

          // Act
          const { ledgerEntries: createdLedgerEntries } =
            await processBillingPeriodTransitionLedgerCommand(
              command,
              transaction
            )

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
})
