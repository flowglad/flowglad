import * as R from 'ramda'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createPendingUsageCreditApplications,
  createLedgerEntriesForApplications,
  processOverageUsageCostCredits,
} from '@/db/ledgerManager/billingPeriodTransitionLedgerCommand/processOverageUsageCostCredits'
import { BillingPeriodTransitionLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import {
  LedgerEntryStatus,
  LedgerEntryDirection,
  LedgerEntryType,
  UsageCreditType,
  UsageCreditApplicationStatus,
  SubscriptionStatus,
  LedgerTransactionType,
  PriceType,
  IntervalUnit,
  BillingPeriodStatus,
  PaymentMethodType,
} from '@/types'
import {
  LedgerTransaction,
  LedgerTransaction as LedgerTransactionSchema,
} from '@/db/schema/ledgerTransactions'
import {
  LedgerAccount,
  LedgerAccount as LedgerAccountSchema,
} from '@/db/schema/ledgerAccounts'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupCustomer,
  setupSubscription,
  setupLedgerAccount,
  setupLedgerTransaction,
  setupDebitLedgerEntry,
  setupUsageEvent,
  setupUsageMeter,
  setupPrice,
  teardownOrg,
  setupPaymentMethod,
  setupBillingPeriod,
  setupBillingRun,
  setupUsageCredit,
  setupUsageCreditApplication,
  setupProduct,
} from '@/../seedDatabase'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { Customer } from '@/db/schema/customers'
import { Subscription } from '@/db/schema/subscriptions'
import { UsageMeter } from '@/db/schema/usageMeters'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Catalog } from '@/db/schema/catalogs'
import { UsageEvent } from '@/db/schema/usageEvents'
import {
  UsageCredit,
  UsageCredit as UsageCreditSchema,
} from '@/db/schema/usageCredits'
import { usageCreditApplications } from '@/db/schema/usageCreditApplications'
import db from '@/db/client'
import { eq } from 'drizzle-orm'
import { UsageCreditApplication } from '@/db/schema/usageCreditApplications'
import { LedgerEntry } from '@/db/schema/ledgerEntries'
import core from '@/utils/core'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { BillingRun } from '@/db/schema/billingRuns'
import {
  balanceFromEntries,
  selectLedgerEntries,
} from '@/db/tableMethods/ledgerEntryMethods'

describe('createPendingUsageCreditApplications', () => {
  let organization: Organization.Record
  let catalog: Catalog.Record
  let product: Product.Record // setupOrg typically creates these
  let price: Price.Record // setupOrg typically creates these
  let usageMeter1: UsageMeter.Record
  let usageMeter2: UsageMeter.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let commandParams: BillingPeriodTransitionLedgerCommand
  let usageCostsAndUsageCreditByLedgerAccountId: Record<
    string,
    {
      ledgerAccountId: string
      usageEventOutstandingBalances: Array<{
        usageEventId: string
        outstandingBalance: number
      }>
      usageCredit: UsageCredit.Record
    }
  >
  let ledgerTransaction: LedgerTransaction.Record
  let usageCredit: UsageCredit.Record
  let ledgerAccountsForSubscription: LedgerAccount.Record[]
  let usageEvent1: UsageEvent.Record
  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    catalog = orgData.catalog
    product = orgData.product
    price = orgData.price
    customer = await setupCustomer({
      organizationId: organization.id,
      livemode: true,
      email: `test+${Math.random()}@test.com`,
    })
    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      livemode: true,
      type: PaymentMethodType.Card,
      customerId: customer.id,
    })
    usageMeter1 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter for App 1',
      catalogId: catalog.id,
    })

    usageMeter2 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter for App 2',
      catalogId: catalog.id,
    })

    const subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      startDate: new Date(),
    })
    const transitionDate = new Date()
    const previousBillingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: new Date(Date.now() - 100000),
      endDate: transitionDate,
      status: BillingPeriodStatus.Active,
      livemode: true,
    })
    const newBillingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: transitionDate,
      endDate: new Date(Date.now() + 100000),
      status: BillingPeriodStatus.Active,
      livemode: true,
    })
    const billingRun = await setupBillingRun({
      livemode: true,
      subscriptionId: subscription.id,
      billingPeriodId: previousBillingPeriod.id,
      paymentMethodId: paymentMethod.id,
    })
    commandParams = {
      type: LedgerTransactionType.BillingPeriodTransition,
      livemode: true,
      organizationId: organization.id,
      subscriptionId: subscription.id,
      payload: {
        billingRunId: billingRun.id,
        subscription,
        subscriptionFeatureItems: [],
        previousBillingPeriod,
        newBillingPeriod,
      },
    }
    const ledgerAccount = await setupLedgerAccount({
      organizationId: organization.id,
      usageMeterId: usageMeter1.id,
      subscriptionId: commandParams.payload.subscription.id,
      livemode: true,
    })
    usageEvent1 = await setupUsageEvent({
      organizationId: organization.id,
      subscriptionId: commandParams.payload.subscription.id,
      usageMeterId: usageMeter1.id,
      amount: 1000,
      priceId: price.id,
      billingPeriodId: commandParams.payload.previousBillingPeriod.id,
      transactionId: 'strp_d1' + Math.random(),
      customerId: customer.id,
    })
    usageCredit = await setupUsageCredit({
      organizationId: organization.id,
      usageMeterId: usageMeter1.id,
      subscriptionId: commandParams.payload.subscription.id,
      livemode: true,
      issuedAmount: 900,
      creditType: UsageCreditType.Grant,
    })
    usageCostsAndUsageCreditByLedgerAccountId = {
      [ledgerAccount.id]: {
        ledgerAccountId: ledgerAccount.id,
        usageEventOutstandingBalances: [
          { usageEventId: usageEvent1.id, outstandingBalance: 100 },
        ],
        usageCredit,
      },
    }
    ledgerAccountsForSubscription = [ledgerAccount]
    ledgerTransaction = await setupLedgerTransaction({
      organizationId: organization.id,
      subscriptionId: commandParams.payload.subscription.id,
      type: LedgerTransactionType.BillingPeriodTransition,
      livemode: true,
    })
  })

  afterEach(async () => {
    if (organization) {
      await teardownOrg({ organizationId: organization.id })
    }
  })

  it('should return an empty array and not create DB entries if input is empty', async () => {
    await adminTransaction(async ({ transaction }) => {
      const usageCostsAndUsageCreditByLedgerAccountId: Record<
        string,
        {
          ledgerAccountId: string
          usageEventOutstandingBalances: Array<{
            usageEventId: string
            outstandingBalance: number
          }>
          usageCredit: UsageCreditSchema.Record
        }
      > = {}
      const result = await createPendingUsageCreditApplications(
        usageCostsAndUsageCreditByLedgerAccountId,
        commandParams,
        transaction
      )

      expect(result).toEqual([])

      const createdApplications = await db
        .select()
        .from(usageCreditApplications)
        .where(
          eq(usageCreditApplications.organizationId, organization.id)
        ) // Limit scope
      expect(createdApplications.length).toBe(0)
    })
  })

  it('should create one application in DB for one ledger account with one usage event', async () => {
    await adminTransaction(async ({ transaction }) => {
      const result = await createPendingUsageCreditApplications(
        usageCostsAndUsageCreditByLedgerAccountId,
        commandParams,
        transaction
      )

      expect(result.length).toBe(1)
      const createdApp = result[0]

      expect(createdApp.organizationId).toBe(organization.id)
      expect(createdApp.livemode).toBe(true)
      expect(createdApp.usageCreditId).toBe(usageCredit.id)
      expect(createdApp.usageEventId).toBe(usageEvent1.id)
      expect(createdApp.amountApplied).toBe(100)
      expect(createdApp.targetUsageMeterId).toBe(usageMeter1.id)
      expect(createdApp.status).toBe(
        UsageCreditApplicationStatus.Pending
      )
    })
  })

  it('should create multiple applications in DB for one ledger account with multiple usage events', async () => {
    const usageEvent2 = await setupUsageEvent({
      organizationId: organization.id,
      subscriptionId: commandParams.payload.subscription.id,
      usageMeterId: usageMeter1.id,
      amount: 500,
      priceId: price.id,
      billingPeriodId: commandParams.payload.previousBillingPeriod.id,
      transactionId: 'strp_d2' + Math.random(),
      customerId: customer.id,
    })
    usageCostsAndUsageCreditByLedgerAccountId[
      ledgerAccountsForSubscription[0].id
    ].usageEventOutstandingBalances.push({
      usageEventId: usageEvent2.id,
      outstandingBalance: 500,
    })
    await adminTransaction(async ({ transaction }) => {
      const result = await createPendingUsageCreditApplications(
        usageCostsAndUsageCreditByLedgerAccountId,
        commandParams,
        transaction
      )
      expect(result.length).toBe(2)
      expect(result[0].usageEventId).toBe(usageEvent1.id)
      expect(result[1].usageEventId).toBe(usageEvent2.id)
    })
  })

  it('should create applications in DB for multiple ledger accounts', async () => {
    // Setup a second ledger account and usage event
    const ledgerAccount2 = await setupLedgerAccount({
      organizationId: organization.id,
      usageMeterId: usageMeter2.id, // Assuming usageMeter2 is set up in beforeEach or globally
      subscriptionId: commandParams.payload.subscription.id,
      livemode: true,
    })

    const usageEvent2 = await setupUsageEvent({
      organizationId: organization.id,
      subscriptionId: commandParams.payload.subscription.id,
      usageMeterId: usageMeter2.id, // Corresponding to ledgerAccount2
      amount: 500,
      priceId: price.id,
      billingPeriodId: commandParams.payload.previousBillingPeriod.id,
      transactionId: 'strp_d_multi_2_' + Math.random(), // Unique transactionId
      customerId: customer.id,
    })

    const usageCredit2 = await setupUsageCredit({
      organizationId: organization.id,
      usageMeterId: usageMeter2.id, // Corresponding to ledgerAccount2
      subscriptionId: commandParams.payload.subscription.id,
      livemode: true,
      issuedAmount: 450, // Example amount
      creditType: UsageCreditType.Grant,
    })

    // Prepare data for both ledger accounts
    const localUsageCostsAndUsageCreditByLedgerAccountId = {
      ...usageCostsAndUsageCreditByLedgerAccountId, // from beforeEach
      [ledgerAccount2.id]: {
        ledgerAccountId: ledgerAccount2.id,
        usageEventOutstandingBalances: [
          { usageEventId: usageEvent2.id, outstandingBalance: 50 }, // Example balance
        ],
        usageCredit: usageCredit2,
      },
    }

    await adminTransaction(async ({ transaction }) => {
      const result = await createPendingUsageCreditApplications(
        localUsageCostsAndUsageCreditByLedgerAccountId,
        commandParams,
        transaction
      )

      expect(result.length).toBe(2)
      // Sort results by usageEventId to ensure consistent order for assertions
      const sortedResults = result.sort((a, b) =>
        a.usageEventId.localeCompare(b.usageEventId)
      )
      const sortedExpectedEventIds = [
        usageEvent1.id,
        usageEvent2.id,
      ].sort((a, b) => a.localeCompare(b))

      expect(sortedResults[0].usageEventId).toBe(
        sortedExpectedEventIds[0]
      )
      expect(sortedResults[1].usageEventId).toBe(
        sortedExpectedEventIds[1]
      )
    })
  })

  it('should handle an item with no usage credit gracefully and not create DB entries for it', async () => {
    await adminTransaction(async ({ transaction }) => {
      const result = await createPendingUsageCreditApplications(
        {},
        commandParams,
        transaction
      )
      expect(result.length).toBe(0)
    })
  })
})

describe('createLedgerEntriesForApplications', () => {
  let organization: Organization.Record
  let catalog: Catalog.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let ledgerTransaction: LedgerTransactionSchema.Record
  let usageMeter1: UsageMeter.Record
  let usageMeter2: UsageMeter.Record
  let ledgerAccount1: LedgerAccountSchema.Record
  let ledgerAccount2: LedgerAccountSchema.Record
  let ledgerAccountsByUsageMeterId: Map<
    string,
    LedgerAccountSchema.Record
  >
  let command: BillingPeriodTransitionLedgerCommand
  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    catalog = orgData.catalog
    product = orgData.product
    price = orgData.price

    customer = await setupCustomer({
      organizationId: organization.id,
      livemode: true,
    })

    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode: true,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
      livemode: true,
    })

    ledgerTransaction = await setupLedgerTransaction({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      type: LedgerTransactionType.BillingPeriodTransition,
      livemode: true,
    })

    usageMeter1 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter 1 for CreateEntries',
      catalogId: catalog.id,
    })

    usageMeter2 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter 2 for CreateEntries',
      catalogId: catalog.id,
    })

    ledgerAccount1 = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter1.id,
      livemode: true,
    })

    ledgerAccount2 = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter2.id,
      livemode: true,
    })

    ledgerAccountsByUsageMeterId = new Map([
      [usageMeter1.id, ledgerAccount1],
      [usageMeter2.id, ledgerAccount2],
    ])
    const previousBillingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
      status: BillingPeriodStatus.Active,
    })

    const newBillingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: new Date('2024-02-01'),
      endDate: new Date('2024-02-28'),
      status: BillingPeriodStatus.Active,
    })
    const billingRun = await setupBillingRun({
      livemode: true,
      subscriptionId: subscription.id,
      billingPeriodId: previousBillingPeriod.id,
      paymentMethodId: paymentMethod.id,
    })
    command = {
      type: LedgerTransactionType.BillingPeriodTransition,
      organizationId: organization.id,
      livemode: true,
      subscriptionId: subscription.id,
      payload: {
        billingRunId: billingRun.id,
        subscription,
        previousBillingPeriod,
        newBillingPeriod,
        subscriptionFeatureItems: [],
      },
    }
  })

  afterEach(async () => {
    if (organization) {
      await teardownOrg({ organizationId: organization.id })
    }
  })

  it('should return an empty array if no usage credit applications are provided', () => {
    // setup:
    // - usageCreditApplications is an empty array
    const usageCreditApplications: UsageCreditApplication.Record[] =
      []

    const result = createLedgerEntriesForApplications(
      usageCreditApplications,
      ledgerTransaction.id,
      ledgerAccountsByUsageMeterId,
      command
    )

    // expects:
    // - The function to return an empty array
    expect(result).toEqual([])
  })

  it('should create two ledger entry insert objects (credit and debit) for one usage credit application', async () => {
    // setup:
    // Create actual DB records for UsageEvent and UsageCredit to be referenced by the application
    const usageEvent = await setupUsageEvent({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter1.id, // Reference from beforeEach
      amount: 50, // Example amount
      priceId: price.id, // Reference from beforeEach
      billingPeriodId: command.payload.previousBillingPeriod.id, // Reference from command in beforeEach
      transactionId: 'ue_test_' + core.nanoid(),
      customerId: customer.id, // Reference from beforeEach
      usageDate: new Date(),
    })

    const usageCredit = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter1.id, // Match the target meter
      creditType: UsageCreditType.Grant,
      issuedAmount: 200, // Example amount, should be >= amountApplied
      livemode: command.livemode,
    })

    const amountToApply = 100

    const usageCreditApplication = await setupUsageCreditApplication({
      organizationId: organization.id,
      usageCreditId: usageCredit.id,
      usageEventId: usageEvent.id,
      amountApplied: amountToApply,
      targetUsageMeterId: usageMeter1.id,
      status: UsageCreditApplicationStatus.Pending,
    })

    const testUsageCreditApplications: UsageCreditApplication.Record[] =
      [usageCreditApplication]

    // expects:
    // - The function to return an array with two ledger entry insert objects
    const result = createLedgerEntriesForApplications(
      testUsageCreditApplications,
      ledgerTransaction.id,
      ledgerAccountsByUsageMeterId,
      command
    )

    expect(result.length).toBe(2)

    const creditEntry = result.find(
      (entry) => entry.direction === LedgerEntryDirection.Credit
    ) as LedgerEntry.UsageCreditApplicationCreditTowardsUsageCostInsert
    const debitEntry = result.find(
      (entry) => entry.direction === LedgerEntryDirection.Debit
    ) as LedgerEntry.UsageCreditApplicationDebitFromCreditBalanceInsert

    expect(creditEntry).toBeDefined()
    expect(debitEntry).toBeDefined()

    // Validate properties of the first entry (CreditTowardsUsageCost)
    expect(creditEntry.ledgerTransactionId).toBe(ledgerTransaction.id)
    expect(creditEntry.ledgerAccountId).toBe(ledgerAccount1.id) // from ledgerAccountsByUsageMeterId.get(usageMeter1.id).id
    expect(creditEntry.subscriptionId).toBe(subscription.id)
    expect(creditEntry.organizationId).toBe(organization.id)
    expect(creditEntry.livemode).toBe(command.livemode)
    expect(creditEntry.status).toBe(LedgerEntryStatus.Pending)
    expect(creditEntry.direction).toBe(LedgerEntryDirection.Credit)
    expect(creditEntry.entryType).toBe(
      LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost
    )
    expect(creditEntry.sourceCreditApplicationId).toBe(
      usageCreditApplication.id
    )
    expect(creditEntry.amount).toBe(amountToApply)
    expect(creditEntry.sourceUsageEventId).toBe(usageEvent.id)
    expect(creditEntry.sourceUsageCreditId).toBe(usageCredit.id)
    expect(creditEntry.entryTimestamp).toEqual(expect.any(Date))

    // Validate properties of the second entry (DebitFromCreditBalance)
    expect(debitEntry.ledgerTransactionId).toBe(ledgerTransaction.id)
    expect(debitEntry.ledgerAccountId).toBe(ledgerAccount1.id)
    expect(debitEntry.subscriptionId).toBe(subscription.id)
    expect(debitEntry.organizationId).toBe(organization.id)
    expect(debitEntry.livemode).toBe(command.livemode)
    expect(debitEntry.status).toBe(LedgerEntryStatus.Pending)
    expect(debitEntry.direction).toBe(LedgerEntryDirection.Debit)
    expect(debitEntry.entryType).toBe(
      LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance
    )
    expect(debitEntry.sourceCreditApplicationId).toBe(
      usageCreditApplication.id
    )
    expect(debitEntry.amount).toBe(amountToApply)
    expect(debitEntry.sourceUsageEventId).toBe(usageEvent.id)
    expect(debitEntry.sourceUsageCreditId).toBe(usageCredit.id)
    expect(debitEntry.entryTimestamp).toEqual(expect.any(Date))
  })

  it('should create 2*N ledger entry insert objects for N usage credit applications', async () => {
    // setup:
    // Create data for the first application (app1)
    const usageEvent1 = await setupUsageEvent({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter1.id,
      amount: 150,
      priceId: price.id,
      billingPeriodId: command.payload.previousBillingPeriod.id,
      transactionId: 'ue_test_n1_' + core.nanoid(),
      customerId: customer.id,
      usageDate: new Date(),
    })
    const usageCredit1 = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter1.id,
      creditType: UsageCreditType.Grant,
      issuedAmount: 200,
      livemode: command.livemode,
    })
    const amountToApply1 = 100
    const usageCreditApplication1 = await setupUsageCreditApplication(
      {
        organizationId: organization.id,
        usageCreditId: usageCredit1.id,
        usageEventId: usageEvent1.id,
        amountApplied: amountToApply1,
        targetUsageMeterId: usageMeter1.id,
        status: UsageCreditApplicationStatus.Pending,
      }
    )

    // Create data for the second application (app2)
    const usageEvent2 = await setupUsageEvent({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter2.id, // Different usage meter
      amount: 75,
      priceId: price.id,
      billingPeriodId: command.payload.previousBillingPeriod.id,
      transactionId: 'ue_test_n2_' + core.nanoid(),
      customerId: customer.id,
      usageDate: new Date(),
    })
    const usageCredit2 = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter2.id, // Match the target meter for app2
      creditType: UsageCreditType.Grant,
      issuedAmount: 100,
      livemode: command.livemode,
    })
    const amountToApply2 = 50
    const usageCreditApplication2 = await setupUsageCreditApplication(
      {
        organizationId: organization.id,
        usageCreditId: usageCredit2.id,
        usageEventId: usageEvent2.id,
        amountApplied: amountToApply2,
        targetUsageMeterId: usageMeter2.id,
        status: UsageCreditApplicationStatus.Pending,
      }
    )

    const testUsageCreditApplications: UsageCreditApplication.Record[] =
      [usageCreditApplication1, usageCreditApplication2]

    // expects:
    // - The function to return an array with 4 ledger entry insert objects.
    const result = createLedgerEntriesForApplications(
      testUsageCreditApplications,
      ledgerTransaction.id,
      ledgerAccountsByUsageMeterId,
      command
    )

    expect(result.length).toBe(4)

    // Helper to find entries for a specific application
    const findEntriesForApp = (appId: string) => {
      const entries = result.filter(
        (entry) => entry.sourceCreditApplicationId === appId
      )
      const creditEntry = entries.find(
        (e) => e.direction === LedgerEntryDirection.Credit
      ) as LedgerEntry.UsageCreditApplicationCreditTowardsUsageCostInsert
      const debitEntry = entries.find(
        (e) => e.direction === LedgerEntryDirection.Debit
      ) as LedgerEntry.UsageCreditApplicationDebitFromCreditBalanceInsert
      return { creditEntry, debitEntry }
    }

    // Validate entries for app1
    const { creditEntry: creditEntry1, debitEntry: debitEntry1 } =
      findEntriesForApp(usageCreditApplication1.id)
    expect(creditEntry1).toBeDefined()
    expect(debitEntry1).toBeDefined()

    expect(creditEntry1.ledgerTransactionId).toBe(
      ledgerTransaction.id
    )
    expect(creditEntry1.ledgerAccountId).toBe(ledgerAccount1.id)
    expect(creditEntry1.subscriptionId).toBe(subscription.id)
    expect(creditEntry1.organizationId).toBe(organization.id)
    expect(creditEntry1.livemode).toBe(command.livemode)
    expect(creditEntry1.status).toBe(LedgerEntryStatus.Pending)
    expect(creditEntry1.entryType).toBe(
      LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost
    )
    expect(creditEntry1.amount).toBe(amountToApply1)
    expect(creditEntry1.sourceUsageEventId).toBe(usageEvent1.id)
    expect(creditEntry1.sourceUsageCreditId).toBe(usageCredit1.id)
    expect(creditEntry1.entryTimestamp).toEqual(expect.any(Date))

    expect(debitEntry1.ledgerTransactionId).toBe(ledgerTransaction.id)
    expect(debitEntry1.ledgerAccountId).toBe(ledgerAccount1.id)
    expect(debitEntry1.subscriptionId).toBe(subscription.id)
    expect(debitEntry1.organizationId).toBe(organization.id)
    expect(debitEntry1.livemode).toBe(command.livemode)
    expect(debitEntry1.status).toBe(LedgerEntryStatus.Pending)
    expect(debitEntry1.entryType).toBe(
      LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance
    )
    expect(debitEntry1.amount).toBe(amountToApply1)
    expect(debitEntry1.sourceUsageEventId).toBe(usageEvent1.id)
    expect(debitEntry1.sourceUsageCreditId).toBe(usageCredit1.id)
    expect(debitEntry1.entryTimestamp).toEqual(expect.any(Date))

    // Validate entries for app2
    const { creditEntry: creditEntry2, debitEntry: debitEntry2 } =
      findEntriesForApp(usageCreditApplication2.id)
    expect(creditEntry2).toBeDefined()
    expect(debitEntry2).toBeDefined()

    expect(creditEntry2.ledgerTransactionId).toBe(
      ledgerTransaction.id
    )
    expect(creditEntry2.ledgerAccountId).toBe(ledgerAccount2.id) // Correct ledger account for app2
    expect(creditEntry2.subscriptionId).toBe(subscription.id)
    expect(creditEntry2.organizationId).toBe(organization.id)
    expect(creditEntry2.livemode).toBe(command.livemode)
    expect(creditEntry2.status).toBe(LedgerEntryStatus.Pending)
    expect(creditEntry2.entryType).toBe(
      LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost
    )
    expect(creditEntry2.amount).toBe(amountToApply2)
    expect(creditEntry2.sourceUsageEventId).toBe(usageEvent2.id)
    expect(creditEntry2.sourceUsageCreditId).toBe(usageCredit2.id)
    expect(creditEntry2.entryTimestamp).toEqual(expect.any(Date))

    expect(debitEntry2.ledgerTransactionId).toBe(ledgerTransaction.id)
    expect(debitEntry2.ledgerAccountId).toBe(ledgerAccount2.id) // Correct ledger account for app2
    expect(debitEntry2.subscriptionId).toBe(subscription.id)
    expect(debitEntry2.organizationId).toBe(organization.id)
    expect(debitEntry2.livemode).toBe(command.livemode)
    expect(debitEntry2.status).toBe(LedgerEntryStatus.Pending)
    expect(debitEntry2.entryType).toBe(
      LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance
    )
    expect(debitEntry2.amount).toBe(amountToApply2)
    expect(debitEntry2.sourceUsageEventId).toBe(usageEvent2.id)
    expect(debitEntry2.sourceUsageCreditId).toBe(usageCredit2.id)
    expect(debitEntry2.entryTimestamp).toEqual(expect.any(Date))
  })
})

const expectLedgerAccountBalanceToBeZero = async (
  ledgerAccountId: string
) => {
  const ledgerEntries = await adminTransaction(
    async ({ transaction }) => {
      return await selectLedgerEntries(
        { ledgerAccountId },
        transaction
      )
    }
  )
  expect(balanceFromEntries(ledgerEntries)).toBe(0)
}

const createLedgerEntryValidator = (params: {
  ledgerAccountId: string
  ledgerTransactionId: string
}) => {
  const validateLedgerEntry = (
    entry: LedgerEntry.Record,
    expected: {
      amount: number
      entryType: LedgerEntryType
      status: LedgerEntryStatus
      direction: LedgerEntryDirection
    }
  ) => {
    expect(entry.ledgerAccountId).toBe(params.ledgerAccountId)
    expect(entry.amount).toBe(expected.amount)
    expect(entry.entryType).toBe(expected.entryType)
    expect(entry.status).toBe(expected.status)
    expect(entry.ledgerTransactionId).toBe(params.ledgerTransactionId)
    expect(entry.livemode).toBe(true)
  }
  return validateLedgerEntry
}

describe('processOverageUsageCostCredits', () => {
  let organization: Organization.Record
  let product: Product.Record
  let catalog: Catalog.Record
  let flatPrice: Price.Record // Standard subscription price from setupOrg
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let mainLedgerTransaction: LedgerTransactionSchema.Record // The one passed to processOverageUsageCostCredits
  let command: BillingPeriodTransitionLedgerCommand
  let previousBillingPeriodOverageTest: BillingPeriod.Record // Corrected type & Renamed
  let newBillingPeriodOverageTest: BillingPeriod.Record // Corrected type & Renamed
  let billingRunOverageTest: BillingRun.Record // Corrected type & Renamed

  // Common meter and price for setting up usage-based scenarios in tests
  let usageMeter1: UsageMeter.Record
  let usageBasedPrice1: Price.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    product = orgData.product
    flatPrice = orgData.price // This is the default flat price created by setupOrg
    catalog = orgData.catalog

    customer = await setupCustomer({
      organizationId: organization.id,
      livemode: true,
    })
    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode: true,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: flatPrice.id, // Subscription with a base flat price
      livemode: true,
    })

    // Setup for the command payload
    const transitionDate = new Date()
    previousBillingPeriodOverageTest = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: new Date(
        transitionDate.getTime() - 30 * 24 * 60 * 60 * 1000
      ), // Approx 30 days ago
      endDate: transitionDate,
      status: BillingPeriodStatus.Active, // Initial status
      livemode: true,
    })
    newBillingPeriodOverageTest = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: transitionDate,
      endDate: new Date(
        transitionDate.getTime() + 30 * 24 * 60 * 60 * 1000
      ), // Approx next 30 days
      status: BillingPeriodStatus.Active,
      livemode: true,
    })
    billingRunOverageTest = await setupBillingRun({
      subscriptionId: subscription.id,
      billingPeriodId: previousBillingPeriodOverageTest.id,
      paymentMethodId: paymentMethod.id,
      livemode: true,
    })

    command = {
      type: LedgerTransactionType.BillingPeriodTransition,
      organizationId: organization.id,
      livemode: true,
      subscriptionId: subscription.id,
      payload: {
        billingRunId: billingRunOverageTest.id,
        subscription,
        subscriptionFeatureItems: [],
        previousBillingPeriod: previousBillingPeriodOverageTest,
        newBillingPeriod: newBillingPeriodOverageTest,
        // payment: null, // Individual tests can set this if needed
      },
    }

    mainLedgerTransaction = await setupLedgerTransaction({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      type: LedgerTransactionType.BillingPeriodTransition, // Matches command type
      livemode: command.livemode,
    })

    // Common usage meter and price for tests to easily create usage costs
    usageMeter1 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Overage Usage Meter 1',
      catalogId: catalog.id,
      livemode: true,
    })
    usageBasedPrice1 = await setupPrice({
      productId: product.id,
      name: 'Metered Price For Overage Tests 1',
      type: PriceType.Usage,
      unitPrice: 10, // Example: $0.10 per unit
      intervalUnit: IntervalUnit.Day, // IntervalUnit/Count less critical for pure usage
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      setupFeeAmount: 0,
      usageMeterId: usageMeter1.id,
    })
  })

  afterEach(async () => {
    if (organization) {
      await teardownOrg({ organizationId: organization.id })
    }
  })

  it('should handle no ledger accounts for the subscription without creating new DB entities', async () => {
    const ledgerAccountsForSubscription: LedgerAccountSchema.Record[] =
      []
    const result = await adminTransaction(async ({ transaction }) => {
      return await processOverageUsageCostCredits(
        {
          ledgerAccountsForSubscription,
          ledgerTransaction: mainLedgerTransaction,
          command,
        },
        transaction
      )
    })

    expect(result).toEqual([])
  })

  it('should handle ledger accounts with no outstanding usage costs without creating new ledger entries', async () => {
    const newUsageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Overage Usage Meter 1',
      catalogId: catalog.id,
      livemode: true,
    })
    const ledgerAccount1 = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: newUsageMeter.id,
      livemode: true,
    })
    const ledgerAccountsForSubscription: LedgerAccountSchema.Record[] =
      [ledgerAccount1]

    const result = await adminTransaction(async ({ transaction }) => {
      return await processOverageUsageCostCredits(
        {
          ledgerAccountsForSubscription,
          ledgerTransaction: mainLedgerTransaction,
          command,
        },
        transaction
      )
    })

    expect(result).toEqual([])
  })

  it('should process one ledger account with one outstanding usage cost and a payment, creating all related DB entities', async () => {
    const newUsageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Overage Usage Meter 1',
      catalogId: catalog.id,
      livemode: true,
    })
    const usageEvent1 = await setupUsageEvent({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: newUsageMeter.id,
      livemode: true,
      amount: 100000000,
      priceId: usageBasedPrice1.id,
      billingPeriodId: previousBillingPeriodOverageTest.id,
      transactionId: mainLedgerTransaction.id,
      customerId: customer.id,
    })

    const ledgerAccount1 = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: newUsageMeter.id,
      livemode: true,
    })
    const externalLedgerTransaction = await setupLedgerTransaction({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      type: LedgerTransactionType.UsageEventProcessed,
      livemode: true,
    })
    await setupDebitLedgerEntry({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: newUsageMeter.id,
      amount: 100000000,
      livemode: true,
      entryType: LedgerEntryType.UsageCost,
      entryTimestamp: new Date(),
      status: LedgerEntryStatus.Posted,
      sourceUsageEventId: usageEvent1.id,
      ledgerTransactionId: externalLedgerTransaction.id,
      ledgerAccountId: ledgerAccount1.id,
    })

    const ledgerAccountsForSubscription: LedgerAccountSchema.Record[] =
      [ledgerAccount1]

    const result = await adminTransaction(async ({ transaction }) => {
      return await processOverageUsageCostCredits(
        {
          ledgerAccountsForSubscription,
          ledgerTransaction: mainLedgerTransaction,
          command,
        },
        transaction
      )
    })

    expect(result.length).toEqual(3)

    // setup:
    // - Create a LedgerAccount record in DB: la_s1 (id: 'la_s1_id', usageMeterId: 'um_s1').
    // - Create a LedgerTransaction record in DB: ltx_s1 (id: 'ltx_s1_id').
    // - Create a Payment record in DB: pay_s1 (id: 'pay_s1_id').
    // - Create a LedgerEntry record in DB representing an outstanding usage cost for la_s1:
    //   - ledgerAccountId: 'la_s1_id', usageMeterId: 'um_s1', usageEventId: 'ue_s1', amount: 100 (balance).
    // - params:
    //   - ledgerAccountsForSubscription: [la_s1]
    //   - ledgerTransaction: ltx_s1
    //   - command: { ...mockBaseCommand, subscriptionId: la_s1.subscriptionId (if applicable), payload: { payment: pay_s1 } }
    // - Provide a real DbTransaction instance.
    // expects:
    // - The function completes without errors.
    // - Query the database to verify:
    //   1. One UsageCredit record created:
    //      - issuedAmount: 100, usageMeterId: 'um_s1', subscriptionId: command.subscriptionId, paymentId: 'pay_s1_id'
    //      - status: UsageCreditStatus.Pending
    //   2. One UsageCreditApplication record created:
    //      - Link to the created UsageCredit, usageEventId: 'ue_s1', amountApplied: 100
    //      - targetUsageMeterId: 'um_s1', status: UsageCreditApplicationStatus.Pending
    //   3. Three new LedgerEntry records created (linked to ltx_s1_id):
    //      - CreditGrantRecognized: ledgerAccountId: 'la_s1_id', amount: 100, sourceUsageCreditId pointing to new UsageCredit.
    //      - UsageCreditApplicationCreditTowardsUsageCost: ledgerAccountId: 'la_s1_id', amount: 100, sourceCreditApplicationId pointing to new Application.
    //      - UsageCreditApplicationDebitFromCreditBalance: ledgerAccountId: 'la_s1_id', amount: 100, sourceCreditApplicationId pointing to new Application.
    //      - All entries have status: LedgerEntryStatus.Pending, correct organizationId, livemode.
    const ledgerEntries = await adminTransaction(
      async ({ transaction }) => {
        return await selectLedgerEntries(
          {
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerTransactionId: mainLedgerTransaction.id,
          },
          transaction
        )
      }
    )
    expect(ledgerEntries.length).toBe(3)
    const validateLedgerEntry = createLedgerEntryValidator({
      ledgerAccountId: ledgerAccount1.id,
      ledgerTransactionId: mainLedgerTransaction.id,
    })
    const coreParams = {
      amount: usageEvent1.amount,
      status: LedgerEntryStatus.Pending,
    }
    // First item should be a credit grant recognized (credit grant)
    validateLedgerEntry(ledgerEntries[0], {
      ...coreParams,
      entryType: LedgerEntryType.CreditGrantRecognized,
      direction: LedgerEntryDirection.Credit,
    })
    // Test second one (credit application credit towards usage cost)
    validateLedgerEntry(ledgerEntries[1], {
      ...coreParams,
      entryType:
        LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost,
      direction: LedgerEntryDirection.Credit,
    })
    // Test third one
    validateLedgerEntry(ledgerEntries[2], {
      ...coreParams,
      entryType:
        LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance,
      direction: LedgerEntryDirection.Debit,
    })
    await expectLedgerAccountBalanceToBeZero(ledgerAccount1.id)
  })

  it('should process one ledger account with one outstanding usage cost and no payment, creating entities with null paymentId', async () => {
    const newUsageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Overage Usage Meter 1',
      catalogId: catalog.id,
      livemode: true,
    })
    const usageEvent1 = await setupUsageEvent({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: newUsageMeter.id,
      livemode: true,
      amount: 100000000,
      priceId: usageBasedPrice1.id,
      billingPeriodId: previousBillingPeriodOverageTest.id,
      transactionId: mainLedgerTransaction.id,
      customerId: customer.id,
    })

    const ledgerAccount1 = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: newUsageMeter.id,
      livemode: true,
    })
    const externalLedgerTransaction = await setupLedgerTransaction({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      type: LedgerTransactionType.UsageEventProcessed,
      livemode: true,
    })
    await setupDebitLedgerEntry({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: newUsageMeter.id,
      amount: 100000000,
      livemode: true,
      entryType: LedgerEntryType.UsageCost,
      entryTimestamp: new Date(),
      status: LedgerEntryStatus.Posted,
      sourceUsageEventId: usageEvent1.id,
      ledgerTransactionId: externalLedgerTransaction.id,
      ledgerAccountId: ledgerAccount1.id,
    })

    const ledgerAccountsForSubscription: LedgerAccountSchema.Record[] =
      [ledgerAccount1]

    // setup:
    // - Similar to the above, but command.payload.payment is null (or payload is empty).
    // - No Payment record (pay_s1) needed or created for this test setup.
    // - Create LedgerAccount, LedgerTransaction, and the initial outstanding LedgerEntry.
    // - Provide a real DbTransaction instance.
    const commandWithoutPayment: BillingPeriodTransitionLedgerCommand =
      {
        ...command,
        payload: {
          ...command.payload,
          payment: undefined,
        },
      }

    const result = await adminTransaction(async ({ transaction }) => {
      return await processOverageUsageCostCredits(
        {
          ledgerAccountsForSubscription,
          ledgerTransaction: mainLedgerTransaction,
          command: commandWithoutPayment,
        },
        transaction
      )
    })
    expect(result.length).toEqual(3)

    const ledgerEntries = await adminTransaction(
      async ({ transaction }) => {
        return await selectLedgerEntries(
          {
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerTransactionId: mainLedgerTransaction.id,
          },
          transaction
        )
      }
    )
    expect(ledgerEntries.length).toBe(3)
    await expectLedgerAccountBalanceToBeZero(ledgerAccount1.id)
    const validateLedgerEntry = createLedgerEntryValidator({
      ledgerAccountId: ledgerAccount1.id,
      ledgerTransactionId: mainLedgerTransaction.id,
    })
    const coreParams = {
      amount: usageEvent1.amount,
      status: LedgerEntryStatus.Pending,
    }
    validateLedgerEntry(ledgerEntries[0], {
      ...coreParams,
      entryType: LedgerEntryType.CreditGrantRecognized,
      direction: LedgerEntryDirection.Credit,
    })
    validateLedgerEntry(ledgerEntries[1], {
      ...coreParams,
      entryType:
        LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost,
      direction: LedgerEntryDirection.Credit,
    })
    validateLedgerEntry(ledgerEntries[2], {
      ...coreParams,
      entryType:
        LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance,
      direction: LedgerEntryDirection.Debit,
    })
    // expects:
    // - The function completes without errors.
    // - Query the database: Similar entities as above are created, but the UsageCredit record has paymentId: null.
  })

  it('should correctly process one ledger account with multiple outstanding usage costs', async () => {
    // Test reflects the logic: one credit created based on one balance from tabulateOutstandingUsageCosts's map, multiple applications made.
    // setup:
    // - Create LedgerAccount: la_m1 (id: 'la_m1_id', usageMeterId: 'um_m1').
    // - Create LedgerTransaction: ltx_m1.
    // - Create two LedgerEntry records for la_m1 representing outstanding costs:
    //   1. usageEventId: 'ue_m_a', amount (balance): 100.
    //   2. usageEventId: 'ue_m_b', amount (balance): 50. (Assume this one's balance is what tabulateOutstandingUsageCosts map provides for the credit).
    // - params: ledgerAccountsForSubscription: [la_m1], ledgerTransaction: ltx_m1, command: { ...mockBaseCommand, payload: {} }.
    // - Provide a real DbTransaction instance.
    // expects:
    // - The function completes without error.
    // - Query the database:
    //   1. One UsageCredit created, issuedAmount: 50 (based on the balance determined by tabulateOutstandingUsageCosts for the credit grant).
    //   2. Two UsageCreditApplication records created:
    //      - App A: for ue_m_a, amountApplied: 100 (from ue_m_a's balance), linked to the single UsageCredit.
    //      - App B: for ue_m_b, amountApplied: 50 (from ue_m_b's balance), linked to the single UsageCredit.
    //   3. Five new LedgerEntry records created:
    //      - 1 for CreditGrantRecognized (amount 50).
    //      - 2 for UsageCreditApplicationCreditTowardsUsageCost (amounts 100 and 50).
    //      - 2 for UsageCreditApplicationDebitFromCreditBalance (amounts 100 and 50).
    const newUsageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Overage Usage Meter 1',
      catalogId: catalog.id,
      livemode: true,
    })
    const usageEvent1 = await setupUsageEvent({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: newUsageMeter.id,
      livemode: true,
      amount: 100,
      priceId: usageBasedPrice1.id,
      billingPeriodId: previousBillingPeriodOverageTest.id,
      transactionId: 'dummy_txn_1_' + Math.random(),
      customerId: customer.id,
    })

    const ledgerAccount1 = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: newUsageMeter.id,
      livemode: true,
    })
    const usageEvent2 = await setupUsageEvent({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: newUsageMeter.id,
      livemode: true,
      amount: 50,
      priceId: usageBasedPrice1.id,
      billingPeriodId: previousBillingPeriodOverageTest.id,
      transactionId: 'dummy_txn_2_' + Math.random(),
      customerId: customer.id,
    })

    const externalLedgerTransaction = await setupLedgerTransaction({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      type: LedgerTransactionType.UsageEventProcessed,
      livemode: true,
    })
    await setupDebitLedgerEntry({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: newUsageMeter.id,
      amount: usageEvent1.amount,
      livemode: true,
      entryType: LedgerEntryType.UsageCost,
      entryTimestamp: new Date(),
      status: LedgerEntryStatus.Posted,
      sourceUsageEventId: usageEvent1.id,
      ledgerTransactionId: externalLedgerTransaction.id,
      ledgerAccountId: ledgerAccount1.id,
    })
    await setupDebitLedgerEntry({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: newUsageMeter.id,
      amount: usageEvent2.amount,
      livemode: true,
      entryType: LedgerEntryType.UsageCost,
      entryTimestamp: new Date(),
      status: LedgerEntryStatus.Posted,
      sourceUsageEventId: usageEvent2.id,
      ledgerTransactionId: externalLedgerTransaction.id,
      ledgerAccountId: ledgerAccount1.id,
    })
    const ledgerAccountsForSubscription: LedgerAccountSchema.Record[] =
      [ledgerAccount1]
    const result = await adminTransaction(async ({ transaction }) => {
      return await processOverageUsageCostCredits(
        {
          ledgerAccountsForSubscription,
          ledgerTransaction: mainLedgerTransaction,
          command,
        },
        transaction
      )
    })

    const newLedgerEntries = result
    expect(newLedgerEntries.length).toBe(5)
    console.log('newLedgerEntries', newLedgerEntries)
    const validateLedgerEntry = createLedgerEntryValidator({
      ledgerAccountId: ledgerAccount1.id,
      ledgerTransactionId: mainLedgerTransaction.id,
    })
    const coreParams = {
      status: LedgerEntryStatus.Pending,
    }
    validateLedgerEntry(newLedgerEntries[0], {
      ...coreParams,
      entryType: LedgerEntryType.CreditGrantRecognized,
      direction: LedgerEntryDirection.Credit,
      amount: usageEvent1.amount + usageEvent2.amount,
    })
    validateLedgerEntry(newLedgerEntries[1], {
      ...coreParams,
      entryType:
        LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost,
      direction: LedgerEntryDirection.Credit,
      amount: usageEvent1.amount,
    })
    validateLedgerEntry(newLedgerEntries[2], {
      ...coreParams,
      entryType:
        LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance,
      direction: LedgerEntryDirection.Debit,
      amount: usageEvent1.amount,
    })
    validateLedgerEntry(newLedgerEntries[3], {
      ...coreParams,
      entryType:
        LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost,
      direction: LedgerEntryDirection.Credit,
      amount: usageEvent2.amount,
    })
    validateLedgerEntry(newLedgerEntries[4], {
      ...coreParams,
      entryType:
        LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance,
      direction: LedgerEntryDirection.Debit,
      amount: usageEvent2.amount,
    })
    await expectLedgerAccountBalanceToBeZero(ledgerAccount1.id)
  })

  it('should process multiple ledger accounts, creating entities only for those with costs', async () => {
    const setupUsagePrice = async (usageMeterId: string) => {
      const usageProduct = await setupProduct({
        organizationId: organization.id,
        name: 'Test Product',
        active: true,
        livemode: true,
        catalogId: catalog.id,
      })
      return await setupPrice({
        productId: usageProduct.id,
        name: 'Test Price ' + usageMeterId,
        type: PriceType.Usage,
        unitPrice: 100,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        setupFeeAmount: 0,
        isDefault: true,
        active: true,
        livemode: true,
        usageMeterId,
      })
    }
    const newUsageMeter1 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Overage Usage Meter 1',
      catalogId: catalog.id,
      livemode: true,
    })
    const price1 = await setupUsagePrice(newUsageMeter1.id)
    const newUsageMeter2 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Overage Usage Meter 2',
      catalogId: catalog.id,
      livemode: true,
    })
    const price2 = await setupUsagePrice(newUsageMeter2.id)
    const newUsageMeter3 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Overage Usage Meter 3',
      catalogId: catalog.id,
      livemode: true,
    })
    const price3 = await setupUsagePrice(newUsageMeter3.id)
    const usageEvent1 = await setupUsageEvent({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: newUsageMeter1.id,
      livemode: true,
      amount: 70,
      priceId: price1.id,
      billingPeriodId: previousBillingPeriodOverageTest.id,
      transactionId: 'dummy_txn_1_' + Math.random(),
      customerId: customer.id,
    })
    const usageEvent2 = await setupUsageEvent({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: newUsageMeter2.id,
      livemode: true,
      amount: 30,
      priceId: price2.id,
      billingPeriodId: previousBillingPeriodOverageTest.id,
      transactionId: 'dummy_txn_2_' + Math.random(),
      customerId: customer.id,
    })
    const usageEvent3 = await setupUsageEvent({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: newUsageMeter3.id,
      livemode: true,
      amount: 10,
      priceId: price3.id,
      billingPeriodId: previousBillingPeriodOverageTest.id,
      transactionId: 'dummy_txn_3_' + Math.random(),
      customerId: customer.id,
    })
    const coreLedgerAccountParams = {
      organizationId: organization.id,
      subscriptionId: subscription.id,
      livemode: true,
    }
    const ledgerAccount1 = await setupLedgerAccount({
      ...coreLedgerAccountParams,
      usageMeterId: newUsageMeter1.id,
    })
    const ledgerAccount2 = await setupLedgerAccount({
      ...coreLedgerAccountParams,
      usageMeterId: newUsageMeter2.id,
    })
    const ledgerAccount3 = await setupLedgerAccount({
      ...coreLedgerAccountParams,
      usageMeterId: newUsageMeter3.id,
    })
    const usageEventsByLedgerAccountId = {
      [ledgerAccount1.id]: [usageEvent1],
      [ledgerAccount2.id]: [usageEvent2],
      [ledgerAccount3.id]: [usageEvent3],
    }
    const coreDebitLedgerEntryParams = {
      organizationId: organization.id,
      subscriptionId: subscription.id,
      livemode: true,
      entryType: LedgerEntryType.UsageCost,
      entryTimestamp: new Date(),
      status: LedgerEntryStatus.Posted,
      ledgerTransactionId: mainLedgerTransaction.id,
    } as const
    await setupDebitLedgerEntry({
      ...coreDebitLedgerEntryParams,
      usageMeterId: newUsageMeter1.id,
      amount: usageEvent1.amount,
      sourceUsageEventId: usageEvent1.id,
      ledgerAccountId: ledgerAccount1.id,
    })
    await setupDebitLedgerEntry({
      ...coreDebitLedgerEntryParams,
      usageMeterId: newUsageMeter2.id,
      amount: usageEvent2.amount,
      sourceUsageEventId: usageEvent2.id,
      ledgerAccountId: ledgerAccount2.id,
    })
    await setupDebitLedgerEntry({
      ...coreDebitLedgerEntryParams,
      usageMeterId: newUsageMeter3.id,
      amount: usageEvent3.amount,
      sourceUsageEventId: usageEvent3.id,
      ledgerAccountId: ledgerAccount3.id,
    })
    const newUsageMeter4 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Overage Usage Meter 4',
      catalogId: catalog.id,
      livemode: true,
    })
    const ledgerAccount4 = await setupLedgerAccount({
      ...coreLedgerAccountParams,
      usageMeterId: newUsageMeter4.id,
    })
    // setup:
    // - Create LedgerAccounts: la_mix1 (um_mix1), la_mix2 (um_mix2), la_mix3 (um_mix3).
    // - Create LedgerTransaction: ltx_mix.
    // - Create LedgerEntry for la_mix1: ue_mix1, balance 70.
    // - Create LedgerEntry for la_mix3: ue_mix3, balance 30.
    // - No costs for la_mix2.
    // - params: ledgerAccountsForSubscription: [la_mix1, la_mix2, la_mix3], ledgerTransaction: ltx_mix, command.
    // - Provide a real DbTransaction instance.
    // expects:
    // - The function completes without error.
    // - Query the database:
    //   - Two UsageCredit records created (one for la_mix1 for 70, one for la_mix3 for 30 - assuming tabulateOutstandingUsageCosts provides these balances for grants).
    //   - Two UsageCreditApplication records created (one for ue_mix1, one for ue_mix3).
    //   - Six new LedgerEntry records created (2 grants + 2*2 application-related).
    //   - No entities created related to la_mix2.
    const ledgerEntries = await adminTransaction(
      async ({ transaction }) => {
        return await processOverageUsageCostCredits(
          {
            ledgerAccountsForSubscription: [
              ledgerAccount1,
              ledgerAccount2,
              ledgerAccount3,
              ledgerAccount4,
            ],
            ledgerTransaction: mainLedgerTransaction,
            command,
          },
          transaction
        )
      }
    )
    const usageEventsById = R.groupBy(
      (event) => event.id,
      [usageEvent1, usageEvent2, usageEvent3]
    )
    const usageEventsByLedgerEntryId = new Map(
      ledgerEntries
        .filter((entry) => entry.sourceUsageEventId)
        .map((entry) => [
          entry.sourceUsageEventId!,
          usageEventsById[entry.sourceUsageEventId!]!,
        ])
    )
    /**
     * Expect 9 ledger entries to have been created:
     * - 3 grants (one for each ledger account)
     * - 6 applications (2 for each ledger account)
     */
    expect(ledgerEntries.length).toBe(9)

    const ledgerEntriesByAccountId = R.groupBy(
      (entry) => entry.ledgerAccountId,
      ledgerEntries
    )
    const account1LedgerEntries =
      ledgerEntriesByAccountId[ledgerAccount1.id]
    const account2LedgerEntries =
      ledgerEntriesByAccountId[ledgerAccount2.id]
    const account3LedgerEntries =
      ledgerEntriesByAccountId[ledgerAccount3.id]
    /**
     * For each entry account, expect 3 ledger entries:
     * - 1 grant
     * - 2 applications (one for each usage event)
     * @param accountId
     * @param entries
     */
    const validateEntriesForAccount = (
      accountId: string,
      entries: LedgerEntry.Record[]
    ) => {
      const validateLedgerEntry = createLedgerEntryValidator({
        ledgerAccountId: accountId,
        ledgerTransactionId: mainLedgerTransaction.id,
      })
      entries.forEach((entry, index) => {
        let entryType: LedgerEntryType | undefined
        let direction: LedgerEntryDirection | undefined
        const amount =
          usageEventsByLedgerAccountId[accountId]![0].amount

        if (index === 0) {
          entryType = LedgerEntryType.CreditGrantRecognized
          direction = LedgerEntryDirection.Credit
        } else if (index === 1) {
          entryType =
            LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost
          direction = LedgerEntryDirection.Credit
        } else if (index === 2) {
          entryType =
            LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance
          direction = LedgerEntryDirection.Debit
        } else if (index === 3) {
          entryType =
            LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance
          direction = LedgerEntryDirection.Debit
        } else if (index === 4) {
          entryType =
            LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost
          direction = LedgerEntryDirection.Credit
        } else if (index === 5) {
          entryType =
            LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance
          direction = LedgerEntryDirection.Debit
        }
        if (!entryType) {
          throw new Error('Entry type not found')
        }
        if (!direction) {
          throw new Error('Direction not found')
        }
        if (!amount) {
          throw new Error('Amount not found')
        }
        validateLedgerEntry(entry, {
          status: LedgerEntryStatus.Pending,
          entryType,
          direction,
          amount,
        })
      })
    }
    validateEntriesForAccount(
      ledgerAccount1.id,
      account1LedgerEntries ?? []
    )
    validateEntriesForAccount(
      ledgerAccount2.id,
      account2LedgerEntries ?? []
    )
    validateEntriesForAccount(
      ledgerAccount3.id,
      account3LedgerEntries ?? []
    )
    const entriesForAccount4 = ledgerEntries.filter(
      (entry) => entry.ledgerAccountId === ledgerAccount4.id
    )
    expect(entriesForAccount4.length).toBe(0)
    await expectLedgerAccountBalanceToBeZero(ledgerAccount1.id)
    await expectLedgerAccountBalanceToBeZero(ledgerAccount2.id)
    await expectLedgerAccountBalanceToBeZero(ledgerAccount3.id)
    await expectLedgerAccountBalanceToBeZero(ledgerAccount4.id)
  })

  // it('should handle data that would trigger internal warnings in prepareDataForCreditApplications gracefully', async () => {
  //   // This test simulates a mismatch where a raw usage cost exists but no corresponding credit was prepared for its account.
  //   // setup:
  //   // - Create LedgerAccount: la_w1 (id: 'la_w1_id', usageMeterId: 'um_w1').
  //   // - Create LedgerTransaction: ltx_w1.
  //   // - Create a raw LedgerEntry for la_w1 (this makes aggregateOutstandingBalanceForUsageCosts return it in rawOutstandingUsageCosts):
  //   //   - ledgerAccountId: 'la_w1_id', usageMeterId: 'um_w1', usageEventId: 'ue_w1', balance: 100.
  //   // - Create a different LedgerAccount: la_c1 (id: 'la_c1_id', usageMeterId: 'um_c1').
  //   // - Create an outstanding cost for la_c1 that *will* result in a valid credit grant:
  //   //    - LedgerEntry for la_c1, usageMeterId: 'um_c1', usageEventId: 'ue_c1', balance: 200
  //   // - This setup aims for `createPendingOverageUsageCreditsAndEntries` to create a credit for `la_c1` but *not* for `la_w1` in a way that `prepareDataForCreditApplications`
  //   //   later finds `ue_w1` from `rawOutstandingUsageCosts` but no matching credit for `la_w1_id`.
  //   // - params: ledgerAccountsForSubscription: [la_w1, la_c1], ledgerTransaction: ltx_w1, command.
  //   // - Provide a real DbTransaction instance.
  //   // expects:
  //   // - The function completes without error.
  //   // - Query the database:
  //   //   - UsageCredit, Applications, and associated LedgerEntries are created correctly for la_c1/ue_c1.
  //   //   - No UsageCreditApplication or related application ledger entries are created for la_w1/ue_w1 due to the mismatch.
  //   //   - A UsageCredit grant *might* still be created for la_w1 if tabulateOutstandingUsageCosts picks it up for the grant phase, this depends on the exact flow.
  //   //     The critical part is that the *application* step for ue_w1 is skipped due to the missing prepared credit link.
  // })
})
