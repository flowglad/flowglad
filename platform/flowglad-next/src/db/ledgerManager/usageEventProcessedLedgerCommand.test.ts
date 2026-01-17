import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { and, eq } from 'drizzle-orm'
import {
  setupBillingPeriod,
  setupCreditLedgerEntry,
  setupCustomer,
  setupLedgerAccount,
  setupLedgerTransaction,
  setupOrg,
  setupPaymentMethod,
  setupSubscription,
  setupUsageCredit,
  setupUsageCreditApplication,
  setupUsageEvent,
  setupUsageLedgerScenario,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { UsageEventProcessedLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import {
  createLedgerEntryInsertsForUsageCreditApplications,
  createUsageCreditApplicationsForUsageEvent,
  processUsageEventProcessedLedgerCommand,
} from '@/db/ledgerManager/usageEventProcessedLedgerCommand'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Customer } from '@/db/schema/customers'
import {
  type LedgerAccount,
  ledgerAccounts,
} from '@/db/schema/ledgerAccounts'
import type { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { Subscription } from '@/db/schema/subscriptions'
import {
  UsageCreditApplication,
  UsageCreditApplication as UsageCreditApplicationSchema,
} from '@/db/schema/usageCreditApplications'
import type { UsageEvent } from '@/db/schema/usageEvents'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { selectUsageCreditApplications } from '@/db/tableMethods/usageCreditApplicationMethods'
import { DbTransaction } from '@/db/types'
import {
  BillingPeriodStatus,
  CurrencyCode,
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  LedgerTransactionInitiatingSourceType,
  LedgerTransactionType,
  SubscriptionStatus,
  UsageCreditApplicationStatus,
  UsageCreditType,
} from '@/types'
import core from '@/utils/core'
import {
  aggregateAvailableBalanceForUsageCredit,
  aggregateBalanceForLedgerAccountFromEntries,
} from '../tableMethods/ledgerEntryMethods'
import { selectLedgerTransactions } from '../tableMethods/ledgerTransactionMethods'

const TEST_LIVEMODE = true

interface AvailableCreditBalance {
  usageCreditId: string
  balance: number
}

// Moved let declarations to the top level for file-wide access
let organization: Organization.Record
let pricingModel: PricingModel.Record
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
  const scenarioData = await setupUsageLedgerScenario({})

  organization = scenarioData.organization
  pricingModel = scenarioData.pricingModel
  product = scenarioData.product
  price = scenarioData.price
  customer = scenarioData.customer
  paymentMethod = scenarioData.paymentMethod
  subscription = scenarioData.subscription
  usageMeter = scenarioData.usageMeter
  billingPeriod = scenarioData.billingPeriod
  ledgerAccount = scenarioData.ledgerAccount

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
    transactionId: core.nanoid(),
    customerId: customer.id,
    livemode: TEST_LIVEMODE,
    usageDate: Date.now(),
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
      expect(application1.amountApplied).toBe(30)
      expect(application1.usageEventId).toBe(sampleUsageEvent.id)
      expect(application1.status).toBe(
        UsageCreditApplicationStatus.Posted
      )

      const application2 = applications.find(
        (app) => app.usageCreditId === usageCredit2.id
      )!
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
      expect(application1.amountApplied).toBe(30)

      const application2 = applications.find(
        (app) => app.usageCreditId === usageCredit2.id
      )!
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

describe('aggregateAvailableBalanceForUsageCredit', () => {
  it('should order credit balances by expiresAt (earliest first, null last)', async () => {
    await adminTransaction(async ({ transaction }) => {
      const baseTime = 1_700_000_000_000
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000

      const creditExpiringSoonest = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 50,
        expiresAt: baseTime + thirtyDaysMs,
        livemode: TEST_LIVEMODE,
      })
      const creditExpiringMiddle = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 50,
        expiresAt: baseTime + 2 * thirtyDaysMs,
        livemode: TEST_LIVEMODE,
      })
      const creditExpiringLast = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 50,
        expiresAt: baseTime + 3 * thirtyDaysMs,
        livemode: TEST_LIVEMODE,
      })
      const creditNonExpiring = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 50,
        expiresAt: null,
        livemode: TEST_LIVEMODE,
      })

      for (const usageCredit of [
        creditExpiringLast,
        creditNonExpiring,
        creditExpiringSoonest,
        creditExpiringMiddle,
      ]) {
        await setupCreditLedgerEntry({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerTransactionId: defaultLedgerTransaction.id,
          ledgerAccountId: ledgerAccount.id,
          usageMeterId: usageMeter.id,
          entryType: LedgerEntryType.CreditGrantRecognized,
          sourceUsageCreditId: usageCredit.id,
          amount: 50,
          livemode: TEST_LIVEMODE,
        })
      }

      const createdCreditIds = new Set([
        creditExpiringSoonest.id,
        creditExpiringMiddle.id,
        creditExpiringLast.id,
        creditNonExpiring.id,
      ])

      const balances = await aggregateAvailableBalanceForUsageCredit(
        { ledgerAccountId: ledgerAccount.id },
        transaction
      )

      const createdBalances = balances.filter((balance) =>
        createdCreditIds.has(balance.usageCreditId)
      )

      expect(createdBalances.map((b) => b.usageCreditId)).toEqual([
        creditExpiringSoonest.id,
        creditExpiringMiddle.id,
        creditExpiringLast.id,
        creditNonExpiring.id,
      ])
      expect(createdBalances.map((b) => b.expiresAt)).toEqual([
        baseTime + thirtyDaysMs,
        baseTime + 2 * thirtyDaysMs,
        baseTime + 3 * thirtyDaysMs,
        null,
      ])
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
      // Setup: command
      const commandDescription = `Test processing for usage event ${sampleUsageEvent.id} without credits`
      const command: UsageEventProcessedLedgerCommand = {
        organizationId: organization.id,
        subscriptionId: subscription.id,
        payload: {
          usageEvent: sampleUsageEvent,
        },
        type: LedgerTransactionType.UsageEventProcessed,
        transactionDescription: commandDescription,
        transactionMetadata: { scenario: 'no_credits_applied' },
        livemode: TEST_LIVEMODE,
      }

      // Execute
      const { ledgerTransaction, ledgerEntries } =
        await processUsageEventProcessedLedgerCommand(
          command,
          transaction
        )

      // Verify: LedgerTransaction created

      expect(ledgerTransaction.description).toBe(commandDescription)
      expect(ledgerTransaction.metadata).toEqual({
        scenario: 'no_credits_applied',
      })
      expect(ledgerTransaction.initiatingSourceType).toBe(
        LedgerTransactionInitiatingSourceType.UsageEvent
      )

      // Verify: LedgerEntries created (only UsageCost)
      const createdLedgerEntries = ledgerEntries
      expect(createdLedgerEntries.length).toBe(1)
      const usageCostEntry = createdLedgerEntries.find(
        (le) => le.entryType === LedgerEntryType.UsageCost
      )

      expect(usageCostEntry).toMatchObject({})
      if (usageCostEntry) {
        expect(usageCostEntry.ledgerAccountId).toBe(ledgerAccount.id)
        expect(usageCostEntry.direction).toBe(
          LedgerEntryDirection.Debit
        )
        expect(usageCostEntry.amount).toBe(sampleUsageEvent.amount)
        expect(usageCostEntry.status).toBe(LedgerEntryStatus.Posted)
        expect(usageCostEntry.sourceUsageEventId).toBe(
          sampleUsageEvent.id
        )
        expect(usageCostEntry.organizationId).toBe(organization.id)
        expect(usageCostEntry.livemode).toBe(TEST_LIVEMODE)
        expect(usageCostEntry.description).toBe(
          `Usage event ${sampleUsageEvent.id} processed.`
        )
        expect(usageCostEntry.billingPeriodId).toBe(
          sampleUsageEvent.billingPeriodId!
        )
        expect(usageCostEntry.usageMeterId).toBe(
          sampleUsageEvent.usageMeterId
        )
      }

      // Verify: No UsageCreditApplication records created for this usage event
      const creditApplications = await selectUsageCreditApplications(
        {
          organizationId: organization.id,
          usageEventId: sampleUsageEvent.id,
        },
        transaction
      )

      expect(creditApplications.length).toBe(0)

      const finalBalance =
        await aggregateBalanceForLedgerAccountFromEntries(
          { ledgerAccountId: ledgerAccount.id },
          'available',
          transaction
        )
      expect(finalBalance).toBe(-sampleUsageEvent.amount)
    })
  })

  it('should process a usage event and apply credits partially', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Setup: Create a partial credit
      const creditAmount = 30
      const usageCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id, // Assuming credits can be tied to usage meters
        creditType: UsageCreditType.Grant,
        issuedAmount: creditAmount,
        livemode: TEST_LIVEMODE,
      })

      const creditGrantTransaction = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
        description: 'Test: Grant partial credit',
        livemode: TEST_LIVEMODE,
      })

      await setupCreditLedgerEntry({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerAccountId: ledgerAccount.id,
        ledgerTransactionId: creditGrantTransaction.id,
        sourceUsageCreditId: usageCredit.id,
        entryType: LedgerEntryType.CreditGrantRecognized,
        amount: creditAmount,
        livemode: TEST_LIVEMODE,
        usageMeterId: ledgerAccount.usageMeterId!,
      })

      // Setup: Command for usage event (amount 100)
      const commandDescription = `Test processing for usage event ${sampleUsageEvent.id} with partial credit`
      const command: UsageEventProcessedLedgerCommand = {
        organizationId: organization.id,
        subscriptionId: subscription.id,
        payload: { usageEvent: sampleUsageEvent },
        type: LedgerTransactionType.UsageEventProcessed,
        transactionDescription: commandDescription,
        transactionMetadata: { scenario: 'partial_credit_applied' },
        livemode: TEST_LIVEMODE,
      }

      // Execute
      const {
        ledgerTransaction: processedTx,
        ledgerEntries: processedEntries,
      } = await processUsageEventProcessedLedgerCommand(
        command,
        transaction
      )

      // Verify: Processed LedgerTransaction
      expect(processedTx.description).toBe(commandDescription)
      expect(processedTx.type).toBe(
        LedgerTransactionType.UsageEventProcessed
      )
      expect(processedTx.initiatingSourceId).toBe(sampleUsageEvent.id)
      expect(processedTx.initiatingSourceType).toBe(
        LedgerTransactionInitiatingSourceType.UsageEvent
      )
      expect(processedTx.organizationId).toBe(organization.id)
      expect(processedTx.livemode).toBe(TEST_LIVEMODE)

      // Verify: UsageCreditApplication created
      const creditApplications = await selectUsageCreditApplications(
        {
          organizationId: organization.id,
          usageEventId: sampleUsageEvent.id,
        },
        transaction
      )
      expect(creditApplications.length).toBe(1)
      const application = creditApplications[0]
      expect(application.amountApplied).toBe(creditAmount)
      expect(application.usageCreditId).toBe(usageCredit.id)
      expect(application.status).toBe(
        UsageCreditApplicationStatus.Posted
      )
      expect(application.organizationId).toBe(organization.id)
      expect(application.livemode).toBe(TEST_LIVEMODE)

      // Verify: LedgerEntries created
      expect(processedEntries.length).toBe(3)

      const usageCostEntry = processedEntries.find(
        (le) => le.entryType === LedgerEntryType.UsageCost
      )!
      expect(usageCostEntry.ledgerAccountId).toBe(ledgerAccount.id)
      expect(usageCostEntry.direction).toBe(
        LedgerEntryDirection.Debit
      )
      expect(usageCostEntry.amount).toBe(sampleUsageEvent.amount) // Full amount
      expect(usageCostEntry.status).toBe(LedgerEntryStatus.Posted)
      expect(usageCostEntry.sourceUsageEventId).toBe(
        sampleUsageEvent.id
      )
      expect(usageCostEntry.ledgerTransactionId).toBe(processedTx.id)
      expect(usageCostEntry.organizationId).toBe(organization.id)
      expect(usageCostEntry.livemode).toBe(TEST_LIVEMODE)

      const debitFromCreditBalanceEntry = processedEntries.find(
        (le) =>
          le.entryType ===
          LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance
      )!
      expect(debitFromCreditBalanceEntry.ledgerAccountId).toBe(
        ledgerAccount.id
      )
      expect(debitFromCreditBalanceEntry.direction).toBe(
        LedgerEntryDirection.Debit
      )
      expect(debitFromCreditBalanceEntry.amount).toBe(creditAmount)
      expect(debitFromCreditBalanceEntry.status).toBe(
        LedgerEntryStatus.Posted
      )
      expect(
        debitFromCreditBalanceEntry.sourceCreditApplicationId
      ).toBe(application.id)
      expect(debitFromCreditBalanceEntry.ledgerTransactionId).toBe(
        processedTx.id
      )
      expect(debitFromCreditBalanceEntry.organizationId).toBe(
        organization.id
      )
      expect(debitFromCreditBalanceEntry.livemode).toBe(TEST_LIVEMODE)

      const creditTowardsUsageCostEntry = processedEntries.find(
        (le) =>
          le.entryType ===
          LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost
      )!
      expect(creditTowardsUsageCostEntry.ledgerAccountId).toBe(
        ledgerAccount.id
      )
      expect(creditTowardsUsageCostEntry.direction).toBe(
        LedgerEntryDirection.Credit
      )
      expect(creditTowardsUsageCostEntry.amount).toBe(creditAmount)
      expect(creditTowardsUsageCostEntry.status).toBe(
        LedgerEntryStatus.Posted
      )
      expect(
        creditTowardsUsageCostEntry.sourceCreditApplicationId
      ).toBe(application.id)
      expect(creditTowardsUsageCostEntry.ledgerTransactionId).toBe(
        processedTx.id
      )
      expect(creditTowardsUsageCostEntry.organizationId).toBe(
        organization.id
      )
      expect(creditTowardsUsageCostEntry.livemode).toBe(TEST_LIVEMODE)

      // Verify: Final balance
      const finalBalance =
        await aggregateBalanceForLedgerAccountFromEntries(
          { ledgerAccountId: ledgerAccount.id },
          'available',
          transaction
        )
      // Initial credit: +30. Usage cost: -100. Net effect of application entries on balance: 0.
      // Final balance: 30 - 100 = -70.
      expect(finalBalance).toBe(
        creditAmount - sampleUsageEvent.amount
      )
    })
  })

  it('should process a usage event and apply credits fully', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Setup: Create a credit that fully covers the usage event
      const creditIssuedAmount = 120 // sampleUsageEvent.amount is 100
      const usageCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: creditIssuedAmount,
        livemode: TEST_LIVEMODE,
      })

      const creditGrantTransaction = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
        description: 'Test: Grant full credit',
        livemode: TEST_LIVEMODE,
      })

      await setupCreditLedgerEntry({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerAccountId: ledgerAccount.id,
        ledgerTransactionId: creditGrantTransaction.id,
        sourceUsageCreditId: usageCredit.id,
        entryType: LedgerEntryType.CreditGrantRecognized,
        amount: creditIssuedAmount,
        livemode: TEST_LIVEMODE,
        usageMeterId: ledgerAccount.usageMeterId!,
      })

      // Setup: Command for usage event (amount 100)
      const commandDescription = `Test processing for usage event ${sampleUsageEvent.id} with full credit`
      const command: UsageEventProcessedLedgerCommand = {
        organizationId: organization.id,
        subscriptionId: subscription.id,
        payload: { usageEvent: sampleUsageEvent },
        type: LedgerTransactionType.UsageEventProcessed,
        transactionDescription: commandDescription,
        transactionMetadata: { scenario: 'full_credit_applied' },
        livemode: TEST_LIVEMODE,
      }

      // Execute
      const {
        ledgerTransaction: processedTx,
        ledgerEntries: processedEntries,
      } = await processUsageEventProcessedLedgerCommand(
        command,
        transaction
      )

      // Verify: Processed LedgerTransaction
      expect(processedTx.description).toBe(commandDescription)
      expect(processedTx.type).toBe(
        LedgerTransactionType.UsageEventProcessed
      )
      expect(processedTx.initiatingSourceId).toBe(sampleUsageEvent.id)
      expect(processedTx.initiatingSourceType).toBe(
        LedgerTransactionInitiatingSourceType.UsageEvent
      )
      expect(processedTx.organizationId).toBe(organization.id)
      expect(processedTx.livemode).toBe(TEST_LIVEMODE)

      // Verify: UsageCreditApplication created
      const creditApplications = await selectUsageCreditApplications(
        {
          organizationId: organization.id,
          usageEventId: sampleUsageEvent.id,
        },
        transaction
      )
      expect(creditApplications.length).toBe(1)
      const application = creditApplications[0]
      expect(application.amountApplied).toBe(sampleUsageEvent.amount) // Applied amount is capped at usage event amount
      expect(application.usageCreditId).toBe(usageCredit.id)
      expect(application.status).toBe(
        UsageCreditApplicationStatus.Posted
      )
      expect(application.organizationId).toBe(organization.id)
      expect(application.livemode).toBe(TEST_LIVEMODE)

      // Verify: LedgerEntries created
      expect(processedEntries.length).toBe(3)

      const usageCostEntry = processedEntries.find(
        (le) => le.entryType === LedgerEntryType.UsageCost
      )!
      expect(usageCostEntry.ledgerAccountId).toBe(ledgerAccount.id)
      expect(usageCostEntry.direction).toBe(
        LedgerEntryDirection.Debit
      )
      expect(usageCostEntry.amount).toBe(sampleUsageEvent.amount) // Full event amount
      expect(usageCostEntry.status).toBe(LedgerEntryStatus.Posted)
      expect(usageCostEntry.sourceUsageEventId).toBe(
        sampleUsageEvent.id
      )
      expect(usageCostEntry.ledgerTransactionId).toBe(processedTx.id)
      expect(usageCostEntry.organizationId).toBe(organization.id)
      expect(usageCostEntry.livemode).toBe(TEST_LIVEMODE)

      const debitFromCreditBalanceEntry = processedEntries.find(
        (le) =>
          le.entryType ===
          LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance
      )!
      expect(debitFromCreditBalanceEntry.ledgerAccountId).toBe(
        ledgerAccount.id
      )
      expect(debitFromCreditBalanceEntry.direction).toBe(
        LedgerEntryDirection.Debit
      )
      // Amount debited from credit balance is capped at usage event amount
      expect(debitFromCreditBalanceEntry.amount).toBe(
        sampleUsageEvent.amount
      )
      expect(debitFromCreditBalanceEntry.status).toBe(
        LedgerEntryStatus.Posted
      )
      expect(
        debitFromCreditBalanceEntry.sourceCreditApplicationId
      ).toBe(application.id)
      expect(debitFromCreditBalanceEntry.ledgerTransactionId).toBe(
        processedTx.id
      )
      expect(debitFromCreditBalanceEntry.organizationId).toBe(
        organization.id
      )
      expect(debitFromCreditBalanceEntry.livemode).toBe(TEST_LIVEMODE)

      const creditTowardsUsageCostEntry = processedEntries.find(
        (le) =>
          le.entryType ===
          LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost
      )!
      expect(creditTowardsUsageCostEntry.ledgerAccountId).toBe(
        ledgerAccount.id
      )
      expect(creditTowardsUsageCostEntry.direction).toBe(
        LedgerEntryDirection.Credit
      )
      // Amount credited towards usage cost is capped at usage event amount
      expect(creditTowardsUsageCostEntry.amount).toBe(
        sampleUsageEvent.amount
      )
      expect(creditTowardsUsageCostEntry.status).toBe(
        LedgerEntryStatus.Posted
      )
      expect(
        creditTowardsUsageCostEntry.sourceCreditApplicationId
      ).toBe(application.id)
      expect(creditTowardsUsageCostEntry.ledgerTransactionId).toBe(
        processedTx.id
      )
      expect(creditTowardsUsageCostEntry.organizationId).toBe(
        organization.id
      )
      expect(creditTowardsUsageCostEntry.livemode).toBe(TEST_LIVEMODE)

      // Verify: Final balance
      const finalBalance =
        await aggregateBalanceForLedgerAccountFromEntries(
          { ledgerAccountId: ledgerAccount.id },
          'available',
          transaction
        )
      // Initial credit: +120. Usage event cost: -100.
      // Final balance: 120 - 100 = 20.
      expect(finalBalance).toBe(
        creditIssuedAmount - sampleUsageEvent.amount
      )
    })
  })

  it('should throw an error if findOrCreateLedgerAccountsForSubscriptionAndUsageMeters effectively fails (e.g. bad subscriptionId in command)', async () => {
    const invalidSubscriptionId = `sub_invalid_${Date.now()}` // Unique non-existent ID

    // Command with a subscriptionId that does not belong to the organization.id or is simply invalid
    const command: UsageEventProcessedLedgerCommand = {
      organizationId: organization.id, // Valid organization
      subscriptionId: invalidSubscriptionId, // Invalid/non-existent subscription for this org
      payload: { usageEvent: sampleUsageEvent },
      type: LedgerTransactionType.UsageEventProcessed,
      transactionDescription: 'Test with invalid subscriptionId',
      livemode: TEST_LIVEMODE,
    }

    await expect(
      adminTransaction(async ({ transaction }) => {
        // Expects: The call to processUsageEventProcessedLedgerCommand to throw an error
        return await processUsageEventProcessedLedgerCommand(
          command,
          transaction
        )
      })
    ).rejects.toThrowError('No subscriptions found with id')
    const rogueTransactions = await adminTransaction(
      async ({ transaction }) => {
        return selectLedgerTransactions(
          {
            organizationId: organization.id,
            subscriptionId: invalidSubscriptionId,
          },
          transaction
        )
      }
    )
    expect(rogueTransactions.length).toBe(0)
  })

  it('should create a new ledger account if one does not exist for the subscription and usage meter', async () => {
    await adminTransaction(async ({ transaction }) => {
      // 1. Setup a new UsageMeter that doesn\\'t have a ledger account with the existing subscription
      const newUsageMeter = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'New Meter for LA Creation Test',
        livemode: TEST_LIVEMODE,
      })

      // 2. Create a new UsageEvent for this new meter
      const newUsageEvent = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: newUsageMeter.id, // Linked to the new meter
        amount: 75,
        priceId: price.id, // price.id is from the global setup, tied to global usageMeter. This is fine.
        billingPeriodId: billingPeriod.id,
        transactionId: core.nanoid(), // Re-use existing or create new
        customerId: customer.id,
        livemode: TEST_LIVEMODE,
        usageDate: Date.now(),
      })

      // 3. VERIFY: No LedgerAccount exists yet for this specific subscription and new usage meter
      const ledgerAccountsBefore = await transaction
        .select()
        .from(ledgerAccounts)
        .where(
          and(
            eq(ledgerAccounts.subscriptionId, subscription.id),
            eq(ledgerAccounts.usageMeterId, newUsageMeter.id),
            eq(ledgerAccounts.organizationId, organization.id),
            eq(ledgerAccounts.livemode, TEST_LIVEMODE)
          )
        )
      expect(ledgerAccountsBefore.length).toBe(0)

      // 4. Setup: Command
      const commandDescription = `Test LA creation for UE ${newUsageEvent.id} with new meter ${newUsageMeter.id}`
      const command: UsageEventProcessedLedgerCommand = {
        organizationId: organization.id,
        subscriptionId: subscription.id,
        payload: {
          usageEvent: newUsageEvent,
        },
        type: LedgerTransactionType.UsageEventProcessed,
        transactionDescription: commandDescription,
        livemode: TEST_LIVEMODE,
      }

      // 5. Execute
      const { ledgerTransaction, ledgerEntries } =
        await processUsageEventProcessedLedgerCommand(
          command,
          transaction
        )

      // 6. VERIFY: LedgerTransaction created
      expect(ledgerTransaction.subscriptionId).toBe(subscription.id)
      expect(ledgerTransaction.initiatingSourceId).toBe(
        newUsageEvent.id
      )
      expect(ledgerTransaction.organizationId).toBe(organization.id)
      expect(ledgerTransaction.livemode).toBe(TEST_LIVEMODE)

      // 7. VERIFY: LedgerAccount was created
      const ledgerAccountsAfter = await transaction
        .select()
        .from(ledgerAccounts)
        .where(
          and(
            eq(ledgerAccounts.subscriptionId, subscription.id),
            eq(ledgerAccounts.usageMeterId, newUsageMeter.id),
            eq(ledgerAccounts.organizationId, organization.id),
            eq(ledgerAccounts.livemode, TEST_LIVEMODE)
          )
        )
      expect(ledgerAccountsAfter.length).toBe(1)
      const createdLedgerAccount = ledgerAccountsAfter[0]
      expect(createdLedgerAccount.subscriptionId).toBe(
        subscription.id
      )
      expect(createdLedgerAccount.usageMeterId).toBe(newUsageMeter.id)
      expect(createdLedgerAccount.organizationId).toBe(
        organization.id
      )
      expect(createdLedgerAccount.livemode).toBe(TEST_LIVEMODE)
      // Default normal_balance for a new ledger account via findOrCreate should be 'credit'
      expect(createdLedgerAccount.normalBalance).toBe('credit')

      // 8. VERIFY: LedgerEntries created and linked to the new LedgerAccount
      expect(ledgerEntries.length).toBe(1) // Expecting only UsageCost as no credits were set up for this new meter
      const usageCostEntry = ledgerEntries.find(
        (le) => le.entryType === LedgerEntryType.UsageCost
      )
      expect(usageCostEntry).toMatchObject({})
      if (usageCostEntry) {
        expect(usageCostEntry.ledgerAccountId).toBe(
          createdLedgerAccount.id
        )
        expect(usageCostEntry.amount).toBe(newUsageEvent.amount)
        expect(usageCostEntry.sourceUsageEventId).toBe(
          newUsageEvent.id
        )
        expect(usageCostEntry.subscriptionId).toBe(subscription.id)
        expect(usageCostEntry.organizationId).toBe(organization.id)
        expect(usageCostEntry.livemode).toBe(TEST_LIVEMODE)
        expect(usageCostEntry.billingPeriodId).toBe(
          newUsageEvent.billingPeriodId!
        )
        expect(usageCostEntry.usageMeterId).toBe(
          newUsageEvent.usageMeterId
        )
      }

      // Verify: Final balance
      const finalBalance =
        await aggregateBalanceForLedgerAccountFromEntries(
          { ledgerAccountId: createdLedgerAccount.id },
          'available',
          transaction
        )
      expect(finalBalance).toBe(-newUsageEvent.amount)
    })
  })

  it('should process a usage event with no credits available/applied, with prior usage cost', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Setup: Create a prior unsettled usage cost
      const priorUsageAmount = 50
      const priorUsageEvent = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: priorUsageAmount,
        priceId: price.id,
        billingPeriodId: billingPeriod.id,
        transactionId: core.nanoid(),
        customerId: customer.id,
        livemode: TEST_LIVEMODE,
      })
      await processUsageEventProcessedLedgerCommand(
        {
          organizationId: organization.id,
          subscriptionId: subscription.id,
          payload: {
            usageEvent: priorUsageEvent,
          },
          type: LedgerTransactionType.UsageEventProcessed,
          transactionDescription: 'Prior usage event',
          livemode: TEST_LIVEMODE,
        },
        transaction
      )

      // Setup: command
      const commandDescription = `Test processing for usage event ${sampleUsageEvent.id} without credits`
      const command: UsageEventProcessedLedgerCommand = {
        organizationId: organization.id,
        subscriptionId: subscription.id,
        payload: {
          usageEvent: sampleUsageEvent,
        },
        type: LedgerTransactionType.UsageEventProcessed,
        transactionDescription: commandDescription,
        transactionMetadata: { scenario: 'no_credits_applied' },
        livemode: TEST_LIVEMODE,
      }

      // Execute
      const { ledgerTransaction, ledgerEntries } =
        await processUsageEventProcessedLedgerCommand(
          command,
          transaction
        )

      // Verify: LedgerTransaction created

      expect(ledgerTransaction.description).toBe(commandDescription)
      expect(ledgerTransaction.metadata).toEqual({
        scenario: 'no_credits_applied',
      })
      expect(ledgerTransaction.initiatingSourceType).toBe(
        LedgerTransactionInitiatingSourceType.UsageEvent
      )

      // Verify: LedgerEntries created (only UsageCost)
      const createdLedgerEntries = ledgerEntries
      expect(createdLedgerEntries.length).toBe(1)
      const usageCostEntry = createdLedgerEntries.find(
        (le) => le.entryType === LedgerEntryType.UsageCost
      )

      expect(usageCostEntry).toMatchObject({})
      if (usageCostEntry) {
        expect(usageCostEntry.ledgerAccountId).toBe(ledgerAccount.id)
        expect(usageCostEntry.direction).toBe(
          LedgerEntryDirection.Debit
        )
        expect(usageCostEntry.amount).toBe(sampleUsageEvent.amount)
        expect(usageCostEntry.status).toBe(LedgerEntryStatus.Posted)
        expect(usageCostEntry.sourceUsageEventId).toBe(
          sampleUsageEvent.id
        )
        expect(usageCostEntry.organizationId).toBe(organization.id)
        expect(usageCostEntry.livemode).toBe(TEST_LIVEMODE)
        expect(usageCostEntry.description).toBe(
          `Usage event ${sampleUsageEvent.id} processed.`
        )
        expect(usageCostEntry.billingPeriodId).toBe(
          sampleUsageEvent.billingPeriodId!
        )
        expect(usageCostEntry.usageMeterId).toBe(
          sampleUsageEvent.usageMeterId
        )
      }

      // Verify: No UsageCreditApplication records created for this usage event
      const creditApplications = await selectUsageCreditApplications(
        {
          organizationId: organization.id,
          usageEventId: sampleUsageEvent.id,
        },
        transaction
      )

      expect(creditApplications.length).toBe(0)

      const finalBalance =
        await aggregateBalanceForLedgerAccountFromEntries(
          { ledgerAccountId: ledgerAccount.id },
          'available',
          transaction
        )
      expect(finalBalance).toBe(
        -priorUsageAmount - sampleUsageEvent.amount
      )
    })
  })

  it('should process a usage event and apply credits partially, with prior usage cost', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Setup: Create a prior unsettled usage cost
      const priorUsageAmount = 50
      const priorUsageEvent = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: priorUsageAmount,
        priceId: price.id,
        billingPeriodId: billingPeriod.id,
        transactionId: core.nanoid(),
        customerId: customer.id,
        livemode: TEST_LIVEMODE,
      })
      await processUsageEventProcessedLedgerCommand(
        {
          organizationId: organization.id,
          subscriptionId: subscription.id,
          payload: {
            usageEvent: priorUsageEvent,
          },
          type: LedgerTransactionType.UsageEventProcessed,
          livemode: TEST_LIVEMODE,
        },
        transaction
      )

      // Verify: Final balance
      const finalBalance =
        await aggregateBalanceForLedgerAccountFromEntries(
          { ledgerAccountId: ledgerAccount.id },
          'available',
          transaction
        )
      const creditAmount = 100
      const newUsageAmount = 100
      // Initial balance: 150. New usage: 100.
      // Final balance should be 150 - 100 = 50.
      expect(finalBalance).toBe(
        creditAmount - priorUsageAmount - newUsageAmount
      )
    })
  })

  it('should not apply credits if available balance is zero due to prior usage', async () => {
    await adminTransaction(async ({ transaction }) => {
      // Setup: Grant and fully consume a credit
      const creditAmount = 100
      const priorUsageAmount = 100

      const usageCredit = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: creditAmount,
        usageMeterId: usageMeter.id,
      })
      const grantTx = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
      })
      await setupCreditLedgerEntry({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerAccountId: ledgerAccount.id,
        ledgerTransactionId: grantTx.id,
        sourceUsageCreditId: usageCredit.id,
        entryType: LedgerEntryType.CreditGrantRecognized,
        amount: creditAmount,
        usageMeterId: ledgerAccount.usageMeterId!,
      })
      const priorUsageEvent = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: priorUsageAmount,
        priceId: price.id,
        billingPeriodId: billingPeriod.id,
        transactionId: core.nanoid(),
        customerId: customer.id,
        livemode: TEST_LIVEMODE,
      })
      await processUsageEventProcessedLedgerCommand(
        {
          organizationId: organization.id,
          subscriptionId: subscription.id,
          payload: {
            usageEvent: priorUsageEvent,
          },
          type: LedgerTransactionType.UsageEventProcessed,
          livemode: TEST_LIVEMODE,
        },
        transaction
      )

      const initialBalance =
        await aggregateBalanceForLedgerAccountFromEntries(
          { ledgerAccountId: ledgerAccount.id },
          'available',
          transaction
        )
      expect(initialBalance).toBe(0) // credit grant (100) - usage (100) = 0

      // Execute: Process a new usage event, no credits should be applied
      const newUsageAmount = 50
      const newUsageEvent = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: newUsageAmount,
        priceId: price.id,
        billingPeriodId: billingPeriod.id,
        transactionId: core.nanoid(),
        customerId: customer.id,
        livemode: TEST_LIVEMODE,
      })
      const { ledgerEntries } =
        await processUsageEventProcessedLedgerCommand(
          {
            organizationId: organization.id,
            subscriptionId: subscription.id,
            payload: {
              usageEvent: newUsageEvent,
            },
            type: LedgerTransactionType.UsageEventProcessed,
            livemode: TEST_LIVEMODE,
          },
          transaction
        )

      // Verify: Only a UsageCost entry was created
      expect(ledgerEntries.length).toBe(1)
      expect(ledgerEntries[0].entryType).toBe(
        LedgerEntryType.UsageCost
      )

      const finalBalance =
        await aggregateBalanceForLedgerAccountFromEntries(
          { ledgerAccountId: ledgerAccount.id },
          'available',
          transaction
        )
      expect(finalBalance).toBe(-newUsageAmount)
    })
  })
})
