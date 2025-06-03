import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createUsageCreditApplicationsForUsageEvent,
  createLedgerEntryInsertsForUsageCreditApplications,
  processUsageEventProcessedLedgerCommand,
} from '@/db/ledgerManager/usageEventProcessedLedgerCommand'
import { UsageEventProcessedLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import {
  LedgerEntryStatus,
  LedgerEntryDirection,
  LedgerEntryType,
  LedgerTransactionInitiatingSourceType,
  LedgerTransactionType,
  SubscriptionStatus,
  BillingPeriodStatus,
  CurrencyCode,
  UsageCreditApplicationStatus,
  UsageCreditType,
} from '@/types'
import { UsageEvent } from '@/db/schema/usageEvents'
import {
  UsageCreditApplication,
  UsageCreditApplication as UsageCreditApplicationSchema,
} from '@/db/schema/usageCreditApplications'
import { LedgerAccount } from '@/db/schema/ledgerAccounts'
import { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import { DbTransaction } from '@/db/types'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { Catalog } from '@/db/schema/catalogs'
import { Customer } from '@/db/schema/customers'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { UsageMeter } from '@/db/schema/usageMeters'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupBillingPeriod,
  setupLedgerAccount,
  setupUsageMeter,
  setupLedgerTransaction,
  setupUsageEvent,
  setupCreditLedgerEntry,
  setupUsageCredit,
  setupUsageCreditApplication,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { LedgerEntry } from '@/db/schema/ledgerEntries'
import { UsageCredit } from '@/db/schema/usageCredits'

const TEST_LIVEMODE = true

interface AvailableCreditBalance {
  usageCreditId: string
  balance: number
}

// Moved let declarations to the top level for file-wide access
let organization: Organization.Record
let catalog: Catalog.Record
let product: Product.Record
let price: Price.Record
let customer: Customer.Record
let paymentMethod: PaymentMethod.Record
let subscription: Subscription.Record
let usageMeter: UsageMeter.Record
let billingPeriod: BillingPeriod.Record
let ledgerAccount: LedgerAccount.Record
let sampleUsageEvent: UsageEvent.Record
let defaultLedgerTransaction: LedgerTransaction.Record

// Moved beforeEach to the top level for file-wide setup
beforeEach(async () => {
  const orgData = await setupOrg()
  organization = orgData.organization
  catalog = orgData.catalog
  product = orgData.product
  price = orgData.price

  customer = await setupCustomer({
    organizationId: organization.id,
    livemode: TEST_LIVEMODE,
  })

  paymentMethod = await setupPaymentMethod({
    organizationId: organization.id,
    customerId: customer.id,
    livemode: TEST_LIVEMODE,
  })

  usageMeter = await setupUsageMeter({
    organizationId: organization.id,
    catalogId: catalog.id,
    name: 'Test Usage Meter',
    livemode: TEST_LIVEMODE,
  })

  subscription = await setupSubscription({
    organizationId: organization.id,
    customerId: customer.id,
    paymentMethodId: paymentMethod.id,
    priceId: price.id,
    status: SubscriptionStatus.Active,
    livemode: TEST_LIVEMODE,
  })

  billingPeriod = await setupBillingPeriod({
    subscriptionId: subscription.id,
    startDate: subscription.currentBillingPeriodStart || new Date(),
    endDate:
      subscription.currentBillingPeriodEnd ||
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status: BillingPeriodStatus.Active,
    livemode: TEST_LIVEMODE,
  })

  ledgerAccount = await setupLedgerAccount({
    organizationId: organization.id,
    subscriptionId: subscription.id,
    usageMeterId: usageMeter.id,
    livemode: TEST_LIVEMODE,
  })

  defaultLedgerTransaction = await setupLedgerTransaction({
    organizationId: organization.id,
    subscriptionId: subscription.id,
    type: LedgerTransactionType.AdminCreditAdjusted,
    livemode: TEST_LIVEMODE,
  })

  sampleUsageEvent = await setupUsageEvent({
    organizationId: organization.id,
    subscriptionId: subscription.id,
    usageMeterId: usageMeter.id,
    amount: 100,
    priceId: price.id,
    billingPeriodId: billingPeriod.id,
    transactionId: defaultLedgerTransaction.id,
    customerId: customer.id,
    livemode: TEST_LIVEMODE,
    usageDate: new Date(),
  })
})

describe('createUsageCreditApplicationsForUsageEvent', () => {
  it('should return an empty array if there are no available credit balances', async () => {
    await adminTransaction(async ({ transaction }) => {
      const availableCreditBalances: AvailableCreditBalance[] = []

      const applications =
        await createUsageCreditApplicationsForUsageEvent(
          {
            usageEvent: sampleUsageEvent,
            availableCreditBalances,
            organizationId: organization.id,
          },
          transaction
        )

      expect(applications).toBeInstanceOf(Array)
      expect(applications.length).toBe(0)
    })
  })

  it('should create one application if a single credit balance covers the entire usage event amount', async () => {
    await adminTransaction(async ({ transaction }) => {
      const usageCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 150,
        livemode: TEST_LIVEMODE,
      })

      const availableCreditBalances: AvailableCreditBalance[] = [
        { usageCreditId: usageCredit.id, balance: 150 },
      ]

      const applications =
        await createUsageCreditApplicationsForUsageEvent(
          {
            usageEvent: sampleUsageEvent, // amount: 100
            availableCreditBalances,
            organizationId: organization.id,
          },
          transaction
        )

      expect(applications).toBeInstanceOf(Array)
      expect(applications.length).toBe(1)
      const application = applications[0]
      expect(application.amountApplied).toBe(100)
      expect(application.usageCreditId).toBe(usageCredit.id)
      expect(application.usageEventId).toBe(sampleUsageEvent.id)
      expect(application.status).toBe(
        UsageCreditApplicationStatus.Posted
      )
      expect(application.organizationId).toBe(organization.id)
      expect(application.livemode).toBe(TEST_LIVEMODE)
    })
  })

  it('should create one application if a single credit balance is less than the usage event amount', async () => {
    await adminTransaction(async ({ transaction }) => {
      const usageCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 50,
        livemode: TEST_LIVEMODE,
      })

      const availableCreditBalances: AvailableCreditBalance[] = [
        { usageCreditId: usageCredit.id, balance: 50 },
      ]

      const applications =
        await createUsageCreditApplicationsForUsageEvent(
          {
            usageEvent: sampleUsageEvent, // amount: 100
            availableCreditBalances,
            organizationId: organization.id,
          },
          transaction
        )

      expect(applications).toBeInstanceOf(Array)
      expect(applications.length).toBe(1)
      const application = applications[0]
      expect(application.amountApplied).toBe(50)
      expect(application.usageCreditId).toBe(usageCredit.id)
      expect(application.usageEventId).toBe(sampleUsageEvent.id)
      expect(application.status).toBe(
        UsageCreditApplicationStatus.Posted
      )
    })
  })

  it('should create multiple applications if multiple credit balances are needed to cover the usage event amount', async () => {
    await adminTransaction(async ({ transaction }) => {
      const usageCredit1 = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 30,
        livemode: TEST_LIVEMODE,
      })
      const usageCredit2 = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 90,
        livemode: TEST_LIVEMODE,
      })

      const availableCreditBalances: AvailableCreditBalance[] = [
        { usageCreditId: usageCredit1.id, balance: 30 },
        { usageCreditId: usageCredit2.id, balance: 90 },
      ]

      const applications =
        await createUsageCreditApplicationsForUsageEvent(
          {
            usageEvent: sampleUsageEvent, // amount: 100
            availableCreditBalances,
            organizationId: organization.id,
          },
          transaction
        )

      expect(applications).toBeInstanceOf(Array)
      expect(applications.length).toBe(2)

      const application1 = applications.find(
        (app) => app.usageCreditId === usageCredit1.id
      )!
      expect(application1).toBeDefined()
      expect(application1.amountApplied).toBe(30)
      expect(application1.usageEventId).toBe(sampleUsageEvent.id)
      expect(application1.status).toBe(
        UsageCreditApplicationStatus.Posted
      )

      const application2 = applications.find(
        (app) => app.usageCreditId === usageCredit2.id
      )!
      expect(application2).toBeDefined()
      expect(application2.amountApplied).toBe(70) // 100 (usage) - 30 (from credit1)
      expect(application2.usageEventId).toBe(sampleUsageEvent.id)
      expect(application2.status).toBe(
        UsageCreditApplicationStatus.Posted
      )
    })
  })

  it('should create multiple applications if multiple credit balances cover less than the usage event amount', async () => {
    await adminTransaction(async ({ transaction }) => {
      const usageCredit1 = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 30,
        livemode: TEST_LIVEMODE,
      })
      const usageCredit2 = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 40,
        livemode: TEST_LIVEMODE,
      })

      const availableCreditBalances: AvailableCreditBalance[] = [
        { usageCreditId: usageCredit1.id, balance: 30 },
        { usageCreditId: usageCredit2.id, balance: 40 },
      ]

      const applications =
        await createUsageCreditApplicationsForUsageEvent(
          {
            usageEvent: sampleUsageEvent, // amount: 100
            availableCreditBalances,
            organizationId: organization.id,
          },
          transaction
        )

      expect(applications).toBeInstanceOf(Array)
      expect(applications.length).toBe(2)

      const application1 = applications.find(
        (app) => app.usageCreditId === usageCredit1.id
      )!
      expect(application1).toBeDefined()
      expect(application1.amountApplied).toBe(30)

      const application2 = applications.find(
        (app) => app.usageCreditId === usageCredit2.id
      )!
      expect(application2).toBeDefined()
      expect(application2.amountApplied).toBe(40)
    })
  })

  it('should skip credit balances that are zero and use subsequent non-zero balances', async () => {
    await adminTransaction(async ({ transaction }) => {
      // No need to create usageCredit1 and usageCredit3 in DB as they have 0 balance
      // and are only represented in the availableCreditBalances input array.
      const usageCredit2 = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 120,
        livemode: TEST_LIVEMODE,
      })

      const availableCreditBalances: AvailableCreditBalance[] = [
        { usageCreditId: 'credit_id_1_zero_balance', balance: 0 },
        { usageCreditId: usageCredit2.id, balance: 120 },
        { usageCreditId: 'credit_id_3_zero_balance', balance: 0 },
      ]

      const applications =
        await createUsageCreditApplicationsForUsageEvent(
          {
            usageEvent: sampleUsageEvent, // amount: 100
            availableCreditBalances,
            organizationId: organization.id,
          },
          transaction
        )

      expect(applications).toBeInstanceOf(Array)
      expect(applications.length).toBe(1)
      const application = applications[0]
      expect(application.amountApplied).toBe(100)
      expect(application.usageCreditId).toBe(usageCredit2.id)
      expect(application.status).toBe(
        UsageCreditApplicationStatus.Posted
      )
    })
  })
})

describe('createLedgerEntryInsertsForUsageCreditApplications', () => {
  it('should create a debit and a credit ledger entry insert for a single usage credit application', async () => {
    await adminTransaction(async ({ transaction }) => {
      const usageCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id, // Assuming usage credits are tied to a usage meter
        creditType: UsageCreditType.Grant,
        issuedAmount: 100, // Issued enough to cover the application
        livemode: TEST_LIVEMODE,
      })

      const usageCreditApplication =
        await setupUsageCreditApplication({
          organizationId: organization.id,
          usageCreditId: usageCredit.id,
          usageEventId: sampleUsageEvent.id,
          amountApplied: 50,
          status: UsageCreditApplicationStatus.Posted,
          livemode: TEST_LIVEMODE,
        })

      const inserts =
        createLedgerEntryInsertsForUsageCreditApplications({
          usageCreditApplications: [usageCreditApplication],
          ledgerAccount,
          ledgerTransaction: defaultLedgerTransaction,
        })

      expect(inserts).toBeInstanceOf(Array)
      expect(inserts.length).toBe(2)

      const debitEntry = inserts.find(
        (i) => i.direction === LedgerEntryDirection.Debit
      )!
      expect(debitEntry).toBeDefined()
      expect(debitEntry.ledgerAccountId).toBe(ledgerAccount.id)
      expect(debitEntry.ledgerTransactionId).toBe(
        defaultLedgerTransaction.id
      )
      expect(debitEntry.subscriptionId).toBe(subscription.id)
      expect(debitEntry.status).toBe(LedgerEntryStatus.Posted)
      expect(debitEntry.entryType).toBe(
        LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance
      )
      expect(debitEntry.amount).toBe(50)
      expect(debitEntry.description).toEqual(
        `Debit from credit balance for usage credit application ${usageCreditApplication.id}`
      )
      expect(debitEntry.sourceCreditApplicationId).toBe(
        usageCreditApplication.id
      )
      expect(debitEntry.organizationId).toBe(organization.id)
      expect(debitEntry.livemode).toBe(TEST_LIVEMODE)

      const creditEntry = inserts.find(
        (i) => i.direction === LedgerEntryDirection.Credit
      )!
      expect(creditEntry).toBeDefined()
      expect(creditEntry.ledgerAccountId).toBe(ledgerAccount.id)
      expect(creditEntry.ledgerTransactionId).toBe(
        defaultLedgerTransaction.id
      )
      expect(creditEntry.subscriptionId).toBe(subscription.id)
      expect(creditEntry.status).toBe(LedgerEntryStatus.Posted)
      expect(creditEntry.entryType).toBe(
        LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost
      )
      expect(creditEntry.amount).toBe(50)
      expect(creditEntry.description).toEqual(
        `Credit towards usage cost for usage credit application ${usageCreditApplication.id}`
      )
      expect(creditEntry.sourceCreditApplicationId).toBe(
        usageCreditApplication.id
      )
      expect(creditEntry.organizationId).toBe(organization.id)
      expect(creditEntry.livemode).toBe(TEST_LIVEMODE)
    })
  })

  it('should create debit and credit entries for multiple usage credit applications', async () => {
    await adminTransaction(async ({ transaction }) => {
      const usageCredit1 = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 50,
        livemode: TEST_LIVEMODE,
      })
      const usageCreditApplication1 =
        await setupUsageCreditApplication({
          organizationId: organization.id,
          usageCreditId: usageCredit1.id,
          usageEventId: sampleUsageEvent.id,
          amountApplied: 30,
          status: UsageCreditApplicationStatus.Posted,
          livemode: TEST_LIVEMODE,
        })

      const usageCredit2 = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 100,
        livemode: TEST_LIVEMODE,
      })
      const usageCreditApplication2 =
        await setupUsageCreditApplication({
          organizationId: organization.id,
          usageCreditId: usageCredit2.id,
          usageEventId: sampleUsageEvent.id,
          amountApplied: 70,
          status: UsageCreditApplicationStatus.Posted,
          livemode: TEST_LIVEMODE,
        })

      const inserts =
        createLedgerEntryInsertsForUsageCreditApplications({
          usageCreditApplications: [
            usageCreditApplication1,
            usageCreditApplication2,
          ],
          ledgerAccount,
          ledgerTransaction: defaultLedgerTransaction,
        })

      expect(inserts).toBeInstanceOf(Array)
      expect(inserts.length).toBe(4)

      const debitEntries = inserts.filter(
        (i) => i.direction === LedgerEntryDirection.Debit
      )
      const creditEntries = inserts.filter(
        (i) => i.direction === LedgerEntryDirection.Credit
      )
      expect(debitEntries.length).toBe(2)
      expect(creditEntries.length).toBe(2)

      expect(
        debitEntries.every(
          (de) =>
            de.entryType ===
            LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance
        )
      ).toBe(true)
      expect(
        creditEntries.every(
          (ce) =>
            ce.entryType ===
            LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost
        )
      ).toBe(true)

      const totalDebitAmount = debitEntries.reduce(
        (sum, entry) => sum + entry.amount,
        0
      )
      const totalCreditAmount = creditEntries.reduce(
        (sum, entry) => sum + entry.amount,
        0
      )
      expect(totalDebitAmount).toBe(100) // 30 + 70
      expect(totalCreditAmount).toBe(100) // 30 + 70

      expect(
        debitEntries.find(
          (d) =>
            d.sourceCreditApplicationId === usageCreditApplication1.id
        )!.amount
      ).toBe(30)
      expect(
        creditEntries.find(
          (c) =>
            c.sourceCreditApplicationId === usageCreditApplication1.id
        )!.amount
      ).toBe(30)
      expect(
        debitEntries.find(
          (d) =>
            d.sourceCreditApplicationId === usageCreditApplication2.id
        )!.amount
      ).toBe(70)
      expect(
        creditEntries.find(
          (c) =>
            c.sourceCreditApplicationId === usageCreditApplication2.id
        )!.amount
      ).toBe(70)
    })
  })

  it('should return an empty array if the usageCreditApplications array is empty', () => {
    // No DB setup needed as this is a pure function and we are testing the empty case.
    const inserts =
      createLedgerEntryInsertsForUsageCreditApplications({
        usageCreditApplications: [],
        ledgerAccount,
        ledgerTransaction: defaultLedgerTransaction,
      })

    expect(inserts).toBeInstanceOf(Array)
    expect(inserts.length).toBe(0)
  })
})

describe('processUsageEventProcessedLedgerCommand', () => {
  it('should process a usage event with no credits available/applied', async () => {
    await adminTransaction(async ({ transaction }) => {
      // setup:
      // - A sampleUsageEvent is available from global beforeEach.
      // - Create a command object using createActualCommand(sampleUsageEvent).
      // - Ensure no usage credits with available balance exist for the ledgerAccount via DB setup if necessary,
      //   or rely on aggregateAvailableBalanceForUsageCredit to correctly return [] if ledger account has no credit entries.
      // expects:
      // - insertLedgerTransaction to be called (verify by checking DB for the new transaction).
      // - findOrCreateLedgerAccountsForSubscriptionAndUsageMeters to be effectively called (verify ledger account exists).
      // - aggregateAvailableBalanceForUsageCredit to be called (this will run against DB).
      // - bulkInsertLedgerEntries to be called (verify by checking DB for ledger entries).
      //   - One UsageCost entry should be created for the full amount of sampleUsageEvent.
      //   - No credit application entries should be created.
    })
  })

  it('should process a usage event and apply credits partially', async () => {
    await adminTransaction(async ({ transaction }) => {
      // setup:
      // - Use sampleUsageEvent (e.g., amount = 100).
      // - Create a UsageCredit record for ledgerAccount with an initial issuedAmount (e.g. 30).
      // - Create a LedgerTransaction for this credit grant.
      // - Create a LedgerEntry of type CreditGrantRecognized for this UsageCredit on the ledgerAccount for 30.
      //   This makes `aggregateAvailableBalanceForUsageCredit` return a balance.
      // - Create a command using createActualCommand(sampleUsageEvent).
      // expects:
      // - A new LedgerTransaction (for UsageEventProcessed) is created.
      // - UsageCreditApplications are created (one for 30).
      // - LedgerEntries are created:
      //   - One UsageCost entry for 100 (Debit).
      //   - One UsageCreditApplicationDebitFromCreditBalance entry for 30 (Debit).
      //   - One UsageCreditApplicationCreditTowardsUsageCost entry for 30 (Credit).
      // - Verify these records in the database with correct amounts and links.
    })
  })

  it('should process a usage event and apply credits fully', async () => {
    await adminTransaction(async ({ transaction }) => {
      // setup:
      // - Use sampleUsageEvent (e.g., amount = 100).
      // - Create a UsageCredit for ledgerAccount with issuedAmount >= 100 (e.g. 120).
      // - Create LedgerEntry CreditGrantRecognized for 120.
      // - Create command.
      // expects:
      // - LedgerTransaction created.
      // - UsageCreditApplications created (one for 100).
      // - LedgerEntries created:
      //   - UsageCost for 100 (Debit).
      //   - UsageCreditApplicationDebitFromCreditBalance for 100 (Debit).
      //   - UsageCreditApplicationCreditTowardsUsageCost for 100 (Credit).
    })
  })

  it('should throw an error if findOrCreateLedgerAccountsForSubscriptionAndUsageMeters effectively fails (e.g. bad subscriptionId in command)', async () => {
    // setup:
    // - Create a command with a non-existent/invalid subscriptionId.
    //   (Note: findOrCreateLedgerAccountsForSubscriptionAndUsageMeters might create if not found based on its logic, so this test needs care.
    //    The function being tested, processUsageEventProcessedLedgerCommand, throws if the result of findOrCreate... is empty.)
    //   To guarantee an error: pass a subscriptionId that won't match any existing or be creatable for the org, or an invalid usageMeterId if that causes a failure in findOrCreate...
    // expects:
    // - The call to processUsageEventProcessedLedgerCommand within adminTransaction to throw an error
    //   (specifically "Failed to select ledger account for UsageEventProcessed command").
    // - No new ledger transactions or entries should be created for this faulty command.
  })

  it('should handle null optional fields in the command and usageEvent correctly', async () => {
    await adminTransaction(async ({ transaction }) => {
      // setup:
      // - Create a usageEvent specifically for this test with billingPeriodId = null, etc.
      //   (sampleUsageEvent might have these fields set, so create a new one or update it for this test context).
      // - Create a command using this special usageEvent, with transactionDescription = null, transactionMetadata = null.
      // expects:
      // - A new LedgerTransaction is created in the DB.
      //   - Its description field should be null.
      //   - Its metadata field should be null.
      // - A UsageCost ledger entry is created.
      //   - Its billingPeriodId should be null.
      //   - Its usageMeterId should be based on the usageEvent (which could be null if the event's usageMeterId was null, though usageMeterId on usageEvent is usually non-null).
      // - The process to complete successfully.
    })
  })
})
