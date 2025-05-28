import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  tabulateOutstandingUsageCosts,
  createPendingUsageCreditApplications,
  createLedgerEntriesForApplications,
  processOverageUsageCostCredits,
  OutstandingUsageCostAggregation,
} from './processOverageUsageCostCredits'
import { DbTransaction } from '@/db/types'
import { BillingPeriodTransitionLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import {
  LedgerEntryStatus,
  LedgerEntryDirection,
  LedgerEntryType,
  UsageCreditStatus,
  UsageCreditType,
  UsageCreditSourceReferenceType,
  UsageCreditApplicationStatus,
  SubscriptionStatus,
  LedgerTransactionType,
  PriceType,
  IntervalUnit,
  BillingPeriodStatus,
  PaymentMethodType,
} from '@/types'
import { LedgerTransaction as LedgerTransactionSchema } from '@/db/schema/ledgerTransactions'
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
  setupProduct,
  setupBillingPeriod,
  setupBillingRun,
  setupUsageCredit,
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
import {
  UsageCreditApplication as UsageCreditApplicationSchema,
  usageCreditApplications,
} from '@/db/schema/usageCreditApplications'
import db from '@/db/client'
import { eq, and, inArray } from 'drizzle-orm'
import { selectUsageCreditApplicationById } from '@/db/tableMethods/usageCreditApplicationMethods'

describe('tabulateOutstandingUsageCosts', () => {
  let organization: Organization.Record
  let product: Product.Record
  let catalog: Catalog.Record
  let price: Price.Record
  let usageBasedPrice: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let usageMeter: UsageMeter.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    product = orgData.product
    price = orgData.price
    catalog = orgData.catalog

    customer = await setupCustomer({
      organizationId: organization.id,
    })
    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter For Tabulation',
      catalogId: catalog.id,
    })

    usageBasedPrice = await setupPrice({
      productId: product.id,
      name: 'Metered Price For Tabulation',
      type: PriceType.Usage,
      unitPrice: 10,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      setupFeeAmount: 0,
      currency: organization.defaultCurrency,
      usageMeterId: usageMeter.id,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
    })
  })

  afterEach(async () => {
    if (organization) {
      await teardownOrg({ organizationId: organization.id })
    }
  })

  it('should return empty results when no ledger accounts are provided', async () => {
    await adminTransaction(async ({ transaction }) => {
      const ledgerAccountIds: string[] = []

      const result = await tabulateOutstandingUsageCosts(
        ledgerAccountIds,
        subscription.id,
        transaction
      )

      expect(result.outstandingUsageCostsByLedgerAccountId.size).toBe(
        0
      )
      expect(result.rawOutstandingUsageCosts.length).toBe(0)
    })
  })

  it('should return empty results when ledger accounts exist but have no outstanding costs', async () => {
    const ledgerAccount = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter.id,
      livemode: true,
    })
    await adminTransaction(async ({ transaction }) => {
      const result = await tabulateOutstandingUsageCosts(
        [ledgerAccount.id],
        subscription.id,
        transaction
      )

      expect(result.outstandingUsageCostsByLedgerAccountId.size).toBe(
        0
      )
      expect(result.rawOutstandingUsageCosts.length).toBe(0)
    })
  })

  it('should correctly tabulate a single outstanding usage cost for one ledger account', async () => {
    const ledgerAccount = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter.id,
      livemode: true,
    })
    await adminTransaction(async ({ transaction }) => {
      const ledgerTransaction = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.UsageEventProcessed,
      })
      const billingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date(Date.now() - 1000),
        endDate: new Date(Date.now() + 1000),
        status: BillingPeriodStatus.Active,
        livemode: true,
      })
      const usageEvent = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 5,
        priceId: usageBasedPrice.id,
        billingPeriodId: billingPeriod.id,
        transactionId: 'dummy_txn_1' + Math.random(),
        customerId: customer.id,
        usageDate: new Date(),
      })

      const costEntry = await setupDebitLedgerEntry({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: ledgerTransaction.id,
        ledgerAccountId: ledgerAccount.id,
        amount: 100,
        entryType: LedgerEntryType.UsageCost,
        sourceUsageEventId: usageEvent.id,
        status: LedgerEntryStatus.Posted,
        usageMeterId: usageMeter.id,
      })

      const result = await tabulateOutstandingUsageCosts(
        [ledgerAccount.id],
        subscription.id,
        transaction
      )
      expect(result.rawOutstandingUsageCosts.length).toBe(1)
      const rawCost = result.rawOutstandingUsageCosts[0]
      expect(rawCost.ledgerAccountId).toBe(ledgerAccount.id)
      expect(rawCost.usageMeterId).toBe(usageMeter.id)
      expect(rawCost.usageEventId).toBe(usageEvent.id)
      expect(rawCost.balance).toBe(100)

      expect(result.outstandingUsageCostsByLedgerAccountId.size).toBe(
        1
      )
      const aggregatedCost =
        result.outstandingUsageCostsByLedgerAccountId.get(
          ledgerAccount.id
        )
      expect(aggregatedCost).toBeDefined()
      expect(aggregatedCost?.ledgerAccountId).toBe(ledgerAccount.id)
      expect(aggregatedCost?.usageMeterId).toBe(usageMeter.id)
      expect(aggregatedCost?.subscriptionId).toBe(subscription.id)
      expect(aggregatedCost?.outstandingBalance).toBe(100)
    })
  })

  it('should handle multiple outstanding usage costs for one ledger account (map behavior)', async () => {
    const ledgerAccount = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter.id,
      livemode: true,
    })
    await adminTransaction(async ({ transaction }) => {
      const ledgerTransaction = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.UsageEventProcessed,
      })
      const billingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date(Date.now() - 1000),
        endDate: new Date(Date.now() + 1000),
        status: BillingPeriodStatus.Active,
        livemode: true,
      })
      const usageEvent1 = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 10,
        priceId: usageBasedPrice.id,
        billingPeriodId: billingPeriod.id,
        transactionId: 'dummy_txn_1' + Math.random(),
        customerId: customer.id,
        usageDate: new Date(Date.now() - 2000),
      })
      const usageEvent2 = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 5,
        priceId: usageBasedPrice.id,
        billingPeriodId: billingPeriod.id,
        transactionId: 'dummy_txn_2' + Math.random(),
        customerId: customer.id,
        usageDate: new Date(Date.now() - 1000),
      })

      await setupDebitLedgerEntry({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: ledgerTransaction.id,
        ledgerAccountId: ledgerAccount.id,
        amount: 100,
        entryType: LedgerEntryType.UsageCost,
        sourceUsageEventId: usageEvent1.id,
        status: LedgerEntryStatus.Posted,
        usageMeterId: usageMeter.id,
        entryTimestamp: usageEvent1.usageDate,
      })
      await setupDebitLedgerEntry({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: ledgerTransaction.id,
        ledgerAccountId: ledgerAccount.id,
        amount: 50,
        entryType: LedgerEntryType.UsageCost,
        sourceUsageEventId: usageEvent2.id,
        status: LedgerEntryStatus.Posted,
        usageMeterId: usageMeter.id,
        entryTimestamp: usageEvent2.usageDate,
      })

      const result = await tabulateOutstandingUsageCosts(
        [ledgerAccount.id],
        subscription.id,
        transaction
      )

      expect(result.rawOutstandingUsageCosts.length).toBe(2)
      const sortedRawCosts = [
        ...result.rawOutstandingUsageCosts,
      ].sort((a, b) => a.balance - b.balance)
      expect(sortedRawCosts[0].balance).toBe(50)
      expect(sortedRawCosts[1].balance).toBe(100)

      expect(result.outstandingUsageCostsByLedgerAccountId.size).toBe(
        1
      )
      const aggregatedCost =
        result.outstandingUsageCostsByLedgerAccountId.get(
          ledgerAccount.id
        )
      expect(aggregatedCost).toBeDefined()
      expect(aggregatedCost?.outstandingBalance).toBe(50)
      expect(aggregatedCost?.usageMeterId).toBe(usageMeter.id)
    })
  })

  it('should correctly tabulate costs for multiple ledger accounts, some with and some without costs', async () => {
    const la1 = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter.id,
      livemode: true,
    })
    const anotherUsageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Another Meter',
      catalogId: catalog.id,
    })
    const la2 = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: anotherUsageMeter.id,
      livemode: true,
    })
    const usageMeter3 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Another Meter 3',
      catalogId: catalog.id,
    })
    const la3 = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter3.id,
      livemode: true,
    })

    const lt = await setupLedgerTransaction({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      type: LedgerTransactionType.UsageEventProcessed,
    })
    const billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: new Date(Date.now() - 1000),
      endDate: new Date(Date.now() + 1000),
      status: BillingPeriodStatus.Active,
      livemode: true,
    })
    const ue1 = await setupUsageEvent({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter.id,
      amount: 10,
      priceId: usageBasedPrice.id,
      billingPeriodId: billingPeriod.id,
      transactionId: 'strp_d3' + Math.random(),
      customerId: customer.id,
    })
    await setupDebitLedgerEntry({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      ledgerTransactionId: lt.id,
      ledgerAccountId: la1.id,
      amount: 100,
      entryType: LedgerEntryType.UsageCost,
      sourceUsageEventId: ue1.id,
      status: LedgerEntryStatus.Posted,
      usageMeterId: usageMeter.id,
    })

    const ue3 = await setupUsageEvent({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter3.id,
      amount: 20,
      priceId: usageBasedPrice.id,
      billingPeriodId: billingPeriod.id,
      transactionId: 'strp_d4' + Math.random(),
      customerId: customer.id,
    })
    await setupDebitLedgerEntry({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      ledgerTransactionId: lt.id,
      ledgerAccountId: la3.id,
      amount: 200,
      entryType: LedgerEntryType.UsageCost,
      sourceUsageEventId: ue3.id,
      status: LedgerEntryStatus.Posted,
      usageMeterId: usageMeter.id,
    })

    await adminTransaction(async ({ transaction }) => {
      const result = await tabulateOutstandingUsageCosts(
        [la1.id, la2.id, la3.id],
        subscription.id,
        transaction
      )

      expect(result.rawOutstandingUsageCosts.length).toBe(2)
      expect(result.outstandingUsageCostsByLedgerAccountId.size).toBe(
        2
      )

      const costLa1Raw = result.rawOutstandingUsageCosts.find(
        (c) => c.ledgerAccountId === la1.id
      )
      const costLa3Raw = result.rawOutstandingUsageCosts.find(
        (c) => c.ledgerAccountId === la3.id
      )
      expect(costLa1Raw?.balance).toBe(100)
      expect(costLa3Raw?.balance).toBe(200)

      const aggCostLa1 =
        result.outstandingUsageCostsByLedgerAccountId.get(la1.id)
      expect(aggCostLa1).toEqual<OutstandingUsageCostAggregation>({
        ledgerAccountId: la1.id,
        usageMeterId: usageMeter.id,
        subscriptionId: subscription.id,
        outstandingBalance: 100,
      })

      const aggCostLa3 =
        result.outstandingUsageCostsByLedgerAccountId.get(la3.id)
      expect(aggCostLa3).toEqual<OutstandingUsageCostAggregation>({
        ledgerAccountId: la3.id,
        usageMeterId: usageMeter.id,
        subscriptionId: subscription.id,
        outstandingBalance: 200,
      })

      expect(
        result.outstandingUsageCostsByLedgerAccountId.has(la2.id)
      ).toBe(false)
    })
  })
})

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
    const ledgerAccount = await setupLedgerAccount({
      organizationId: organization.id,
      usageMeterId: usageMeter1.id,
      subscriptionId: commandParams.payload.subscription.id,
      livemode: true,
    })
    const usageEvent = await setupUsageEvent({
      organizationId: organization.id,
      subscriptionId: commandParams.payload.subscription.id,
      usageMeterId: usageMeter1.id,
      amount: 1000,
      priceId: price.id,
      billingPeriodId: commandParams.payload.previousBillingPeriod.id,
      transactionId: 'strp_d1' + Math.random(),
      customerId: customer.id,
    })
    const usageCredit = await setupUsageCredit({
      organizationId: organization.id,
      usageMeterId: usageMeter1.id,
      subscriptionId: commandParams.payload.subscription.id,
      livemode: true,
      issuedAmount: 900,
      creditType: UsageCreditType.Grant,
    })
    const usageCostsAndUsageCreditByLedgerAccountId: Record<
      string,
      {
        ledgerAccountId: string
        usageEventOutstandingBalances: Array<{
          usageEventId: string
          outstandingBalance: number
        }>
        usageCredit: UsageCredit.Record
      }
    > = {
      [ledgerAccount.id]: {
        ledgerAccountId: ledgerAccount.id,
        usageEventOutstandingBalances: [
          { usageEventId: usageEvent.id, outstandingBalance: 100 },
        ],
        usageCredit,
      },
    }

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
      expect(createdApp.usageEventId).toBe(usageEvent.id)
      expect(createdApp.amountApplied).toBe(100)
      expect(createdApp.targetUsageMeterId).toBe(usageMeter1.id)
      expect(createdApp.status).toBe(
        UsageCreditApplicationStatus.Pending
      )
    })
  })

  it('should create multiple applications in DB for one ledger account with multiple usage events', async () => {
    // setup:
    // - usageCostsAndUsageCreditByLedgerAccountId:
    //   {
    //     'la_1_id': {
    //       ledgerAccountId: 'la_1_id',
    //       usageEventOutstandingBalances: [
    //         { usageEventId: 'ue_1', outstandingBalance: 100 },
    //         { usageEventId: 'ue_2', outstandingBalance: 50 }
    //       ],
    //       usageCredit: { id: 'uc_1', usageMeterId: 'um_1', organizationId: 'org_1', livemode: true /*...*/ } as UsageCredit.Record,
    //     }
    //   }
    // - Provide a real DbTransaction instance.
    // expects:
    // - The function returns an array of two UsageCreditApplication.Record objects.
    // - Query the database: Two new UsageCreditApplication records are created, each reflecting its corresponding usageEventId and outstandingBalance.
  })

  it('should create applications in DB for multiple ledger accounts', async () => {
    // setup:
    // - usageCostsAndUsageCreditByLedgerAccountId:
    //   {
    //     'la_1_id': { ledgerAccountId: 'la_1_id', usageEventOutstandingBalances: [{usageEventId: 'ue_1', outstandingBalance: 100}], usageCredit: { id: 'uc_1', usageMeterId: 'um_1', organizationId: 'org_1', livemode: true } as UsageCredit.Record},
    //     'la_2_id': {
    //       ledgerAccountId: 'la_2_id',
    //       usageEventOutstandingBalances: [{ usageEventId: 'ue_3', outstandingBalance: 200 }],
    //       usageCredit: { id: 'uc_2', usageMeterId: 'um_2', organizationId: 'org_1', livemode: true } as UsageCredit.Record,
    //     }
    //   }
    // - Provide a real DbTransaction instance.
    // expects:
    // - The function returns an array of UsageCreditApplication.Record objects for all events.
    // - Query the database: New UsageCreditApplication records are created for all usage events across all accounts.
  })

  it('should handle an item with no usage credit gracefully and not create DB entries for it', async () => {
    // setup:
    // - usageCostsAndUsageCreditByLedgerAccountId:
    //   {
    //     'la_1_id': {
    //       ledgerAccountId: 'la_1_id',
    //       usageEventOutstandingBalances: [{ usageEventId: 'ue_1', outstandingBalance: 100 }],
    //       usageCredit: null as any, // Intentionally null to simulate missing credit
    //     }
    //   }
    // - Provide a real DbTransaction instance.
    // expects:
    // - The function returns an empty array (or an array excluding applications for 'la_1_id').
    // - Query the database: No UsageCreditApplication records are created for 'la_1_id'.
    // - The function does not throw an error.
  })
})

describe('createLedgerEntriesForApplications', () => {
  // This function is a pure data transformer, no direct DB interaction, so no transaction needed for its direct call.
  const mockLedgerTransactionId = 'ltx_1'
  const mockCommand = {
    organizationId: 'org_1',
    livemode: true,
    subscriptionId: 'sub_1',
    // payload details if needed by the function logic for description or metadata
  } as BillingPeriodTransitionLedgerCommand
  const mockLedgerAccountsByUsageMeterId = new Map<
    string,
    LedgerAccount.Record
  >([
    [
      'um_1',
      { id: 'la_1_id', usageMeterId: 'um_1' } as LedgerAccount.Record,
    ],
    [
      'um_2',
      { id: 'la_2_id', usageMeterId: 'um_2' } as LedgerAccount.Record,
    ],
  ])

  it('should return an empty array if no usage credit applications are provided', () => {
    // setup:
    // - usageCreditApplications is an empty array
    // expects:
    // - The function to return an empty array
  })

  it('should create two ledger entry insert objects (credit and debit) for one usage credit application', () => {
    // setup:
    // - Construct one UsageCreditApplication.Record object:
    //   const usageCreditApplications = [{
    //     id: 'uca_1', organizationId: 'org_1', livemode: true,
    //     usageCreditId: 'uc_1', usageEventId: 'ue_1', amountApplied: 100,
    //     targetUsageMeterId: 'um_1', status: UsageCreditApplicationStatus.Pending, appliedAt: new Date(),
    //     // Add other necessary fields for UsageCreditApplication.Record type completeness
    //   }] as UsageCreditApplication.Record[]
    // expects:
    // - The function to return an array with two ledger entry insert objects (types: LedgerEntry.UsageCreditApplicationCreditTowardsUsageCostInsert and LedgerEntry.UsageCreditApplicationDebitFromCreditBalanceInsert).
    // - Validate properties of the first entry (CreditTowardsUsageCost):
    //   - ledgerTransactionId: 'ltx_1', ledgerAccountId: 'la_1_id'
    //   - subscriptionId: 'sub_1', organizationId: 'org_1', livemode: true
    //   - status: LedgerEntryStatus.Pending, direction: LedgerEntryDirection.Credit
    //   - entryType: LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost
    //   - sourceCreditApplicationId: 'uca_1', amount: 100
    //   - sourceUsageEventId: 'ue_1', sourceUsageCreditId: 'uc_1'
    //   - entryTimestamp: expect.any(Date)
    // - Validate properties of the second entry (DebitFromCreditBalance) similarly.
  })

  it('should create 2*N ledger entry insert objects for N usage credit applications', () => {
    // setup:
    // - Construct an array with two UsageCreditApplication.Record objects:
    //   - app1: targetUsageMeterId: 'um_1', amountApplied: 100, id: 'uca_1', usageEventId: 'ue_1', usageCreditId: 'uc_1'
    //   - app2: targetUsageMeterId: 'um_2', amountApplied: 50, id: 'uca_2', usageEventId: 'ue_2', usageCreditId: 'uc_2'
    // expects:
    // - The function to return an array with 4 ledger entry insert objects.
    // - Each pair of entries correctly corresponds to one application (correct amounts, account IDs based on um_1/um_2 mapping, source IDs).
  })

  it('should throw an error if ledgerAccountsByUsageMeterId does not contain a mapping for targetUsageMeterId', () => {
    // setup:
    // - Construct one UsageCreditApplication.Record with targetUsageMeterId = 'um_unknown'.
    // - mockLedgerAccountsByUsageMeterId does NOT contain 'um_unknown'.
    // expects:
    // - The function call to throw a TypeError (or similar) because .get(...).id will be on undefined.
  })
})

describe('processOverageUsageCostCredits', () => {
  const mockLedgerTransaction = {
    id: 'ltx_main_1',
  } as LedgerTransactionSchema.Record
  const mockBaseCommand = {
    organizationId: 'org_main_1',
    livemode: true,
    subscriptionId: 'sub_main_1',
    payload: {},
  } as BillingPeriodTransitionLedgerCommand

  it('should handle no ledger accounts for the subscription without creating new DB entities', async () => {
    // setup:
    // - params:
    //   - ledgerAccountsForSubscription: [] (empty array of LedgerAccount.Record)
    //   - ledgerTransaction: A valid, created LedgerTransaction.Record in the DB.
    //   - command: { ...mockBaseCommand, subscriptionId: 'sub_no_accounts' }
    // - Ensure the database has no pre-existing relevant usage costs for this command's scope.
    // - Provide a real DbTransaction instance.
    // expects:
    // - The function completes without errors.
    // - Query the database: No new UsageCredit, UsageCreditApplication, or related LedgerEntry records are created for this command's execution context.
  })

  it('should handle ledger accounts with no outstanding usage costs without creating new DB entities', async () => {
    // setup:
    // - Create LedgerAccount record(s) (e.g., { id: 'la_no_cost_1', usageMeterId: 'um_no_cost_1' }) in the DB.
    // - Ensure no LedgerEntry records representing outstanding usage costs exist for these accounts and the command's subscriptionId.
    // - params:
    //   - ledgerAccountsForSubscription: The created LedgerAccount.Record(s).
    //   - ledgerTransaction: A valid, created LedgerTransaction.Record.
    //   - command: mockBaseCommand
    // - Provide a real DbTransaction instance.
    // expects:
    // - The function completes without errors.
    // - Query the database: No new UsageCredit, UsageCreditApplication, or related LedgerEntry records are created.
  })

  it('should process one ledger account with one outstanding usage cost and a payment, creating all related DB entities', async () => {
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
  })

  it('should process one ledger account with one outstanding usage cost and no payment, creating entities with null paymentId', async () => {
    // setup:
    // - Similar to the above, but command.payload.payment is null (or payload is empty).
    // - No Payment record (pay_s1) needed or created for this test setup.
    // - Create LedgerAccount, LedgerTransaction, and the initial outstanding LedgerEntry.
    // - Provide a real DbTransaction instance.
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
  })

  it('should process multiple ledger accounts, creating entities only for those with costs', async () => {
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
  })

  it('should handle data that would trigger internal warnings in prepareDataForCreditApplications gracefully', async () => {
    // This test simulates a mismatch where a raw usage cost exists but no corresponding credit was prepared for its account.
    // setup:
    // - Create LedgerAccount: la_w1 (id: 'la_w1_id', usageMeterId: 'um_w1').
    // - Create LedgerTransaction: ltx_w1.
    // - Create a raw LedgerEntry for la_w1 (this makes aggregateOutstandingBalanceForUsageCosts return it in rawOutstandingUsageCosts):
    //   - ledgerAccountId: 'la_w1_id', usageMeterId: 'um_w1', usageEventId: 'ue_w1', balance: 100.
    // - Create a different LedgerAccount: la_c1 (id: 'la_c1_id', usageMeterId: 'um_c1').
    // - Create an outstanding cost for la_c1 that *will* result in a valid credit grant:
    //    - LedgerEntry for la_c1, usageMeterId: 'um_c1', usageEventId: 'ue_c1', balance: 200
    // - This setup aims for `createPendingOverageUsageCreditsAndEntries` to create a credit for `la_c1` but *not* for `la_w1` in a way that `prepareDataForCreditApplications`
    //   later finds `ue_w1` from `rawOutstandingUsageCosts` but no matching credit for `la_w1_id`.
    // - params: ledgerAccountsForSubscription: [la_w1, la_c1], ledgerTransaction: ltx_w1, command.
    // - Provide a real DbTransaction instance.
    // expects:
    // - The function completes without error.
    // - Query the database:
    //   - UsageCredit, Applications, and associated LedgerEntries are created correctly for la_c1/ue_c1.
    //   - No UsageCreditApplication or related application ledger entries are created for la_w1/ue_w1 due to the mismatch.
    //   - A UsageCredit grant *might* still be created for la_w1 if tabulateOutstandingUsageCosts picks it up for the grant phase, this depends on the exact flow.
    //     The critical part is that the *application* step for ue_w1 is skipped due to the missing prepared credit link.
  })
})
