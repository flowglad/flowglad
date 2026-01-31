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
  BillingRunStatus,
  IntervalUnit,
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  LedgerTransactionType,
  SubscriptionStatus,
  UsageCreditStatus,
  UsageCreditType,
} from '@db-core/enums'
import type { BillingPeriod } from '@db-core/schema/billingPeriods'
import type { Customer } from '@db-core/schema/customers'
import type { LedgerAccount } from '@db-core/schema/ledgerAccounts'
import type { LedgerTransaction } from '@db-core/schema/ledgerTransactions'
import type { Organization } from '@db-core/schema/organizations'
import type { PaymentMethod } from '@db-core/schema/paymentMethods'
import type { Price } from '@db-core/schema/prices'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { Product } from '@db-core/schema/products'
import type { Subscription } from '@db-core/schema/subscriptions'
import type { UsageMeter } from '@db-core/schema/usageMeters'
import { Result } from 'better-result'
import {
  setupBillingPeriod,
  setupBillingRun,
  setupCreditLedgerEntry,
  setupCustomer,
  setupLedgerAccount,
  setupLedgerEntries,
  setupLedgerTransaction,
  setupOrg,
  setupPaymentMethod,
  setupSubscription,
  setupUsageCredit,
  setupUsageCreditApplication,
  setupUsageEvent,
  setupUsageMeter,
  teardownOrg,
} from '@/../seedDatabase'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import { expireCreditsAtEndOfBillingPeriod } from '@/db/ledgerManager/billingPeriodTransitionLedgerCommand/expireCreditsAtEndOfBillingPeriod'
import type {
  BillingPeriodTransitionLedgerCommand,
  StandardBillingPeriodTransitionPayload,
} from '@/db/ledgerManager/ledgerManagerTypes'
import { core } from '@/utils/core'

let organization: Organization.Record
let pricingModel: PricingModel.Record
let product: Product.Record
let price: Price.Record
let customer: Customer.Record
let paymentMethod: PaymentMethod.Record
let subscription: Subscription.Record
let usageMeter1: UsageMeter.Record
let ledgerAccount1: LedgerAccount.Record
let previousBillingPeriod: BillingPeriod.Record
let baseLedgerTransaction: LedgerTransaction.Record
let testCommand: BillingPeriodTransitionLedgerCommand

describe('expireCreditsAtEndOfBillingPeriod', () => {
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

    const currentPeriodStartDate = new Date('2024-07-01T00:00:00Z')
    const currentPeriodEndDate = new Date('2024-07-31T23:59:59Z')

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

    usageMeter1 = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Test Usage Meter 1',
    })

    ledgerAccount1 = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter1.id,
      livemode: subscription.livemode,
    })

    const prevPeriodEndDate = new Date(
      currentPeriodStartDate.getTime() - 1
    )
    const prevPeriodStartDate = new Date(prevPeriodEndDate)
    prevPeriodStartDate.setDate(prevPeriodStartDate.getDate() - 30)

    previousBillingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: prevPeriodStartDate,
      endDate: prevPeriodEndDate,
      livemode: subscription.livemode,
    })

    baseLedgerTransaction = await setupLedgerTransaction({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      type: LedgerTransactionType.BillingPeriodTransition,
      description:
        'Base container transaction for credit expirations',
    })
    const billingRun = await setupBillingRun({
      billingPeriodId: previousBillingPeriod.id,
      livemode: subscription.livemode,
      status: BillingRunStatus.InProgress,
      paymentMethodId: paymentMethod.id,
      subscriptionId: subscription.id,
    })
    const newBillingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: currentPeriodStartDate,
      endDate: currentPeriodEndDate,
      livemode: subscription.livemode,
    })
    testCommand = {
      organizationId: organization.id,
      subscriptionId: subscription.id,
      livemode: subscription.livemode,
      type: LedgerTransactionType.BillingPeriodTransition,
      payload: {
        type: 'standard',
        previousBillingPeriod,
        billingRunId: billingRun.id,
        subscription,
        newBillingPeriod,
        subscriptionFeatureItems: [],
      },
    } as BillingPeriodTransitionLedgerCommand
  })

  afterEach(async () => {
    if (organization) {
      await teardownOrg({ organizationId: organization.id })
    }
  })

  it('should do nothing and return empty entries if there are no ledger accounts for the subscription', async () => {
    const result = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return expireCreditsAtEndOfBillingPeriod(
          {
            ledgerAccountsForSubscription: [],
            ledgerTransaction: baseLedgerTransaction,
            command: testCommand,
          },
          transaction
        )
      })
    )
      .unwrap()
      .unwrap()

    expect(result.ledgerTransaction).toEqual(baseLedgerTransaction)
    expect(result.ledgerEntries).toBeInstanceOf(Array)
    expect(result.ledgerEntries).toHaveLength(0)
  })

  it('should do nothing and return empty entries if aggregateAvailableBalanceForUsageCredit returns no balances', async () => {
    const result = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return expireCreditsAtEndOfBillingPeriod(
          {
            ledgerAccountsForSubscription: [ledgerAccount1],
            ledgerTransaction: baseLedgerTransaction,
            command: testCommand,
          },
          transaction
        )
      })
    )
      .unwrap()
      .unwrap()

    expect(result.ledgerTransaction).toEqual(baseLedgerTransaction)
    expect(result.ledgerEntries).toBeInstanceOf(Array)
    expect(result.ledgerEntries).toHaveLength(0)
  })

  it('should not expire credits and return empty entries if balances exist but none are expiring by the previous billing period end date', async () => {
    const nonExpiringCredit1 = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      creditType: UsageCreditType.Grant,
      issuedAmount: 100,
      usageMeterId: usageMeter1.id,
      expiresAt: null,
      livemode: subscription.livemode,
    })
    await setupCreditLedgerEntry({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      ledgerTransactionId: baseLedgerTransaction.id,
      ledgerAccountId: ledgerAccount1.id,
      amount: 100,
      entryType: LedgerEntryType.CreditGrantRecognized,
      sourceUsageCreditId: nonExpiringCredit1.id,
      livemode: subscription.livemode,
      usageMeterId: ledgerAccount1.usageMeterId!,
    })

    const futureExpiryDate = new Date(
      (testCommand.payload as StandardBillingPeriodTransitionPayload)
        .previousBillingPeriod!.endDate
    )
    futureExpiryDate.setDate(futureExpiryDate.getDate() + 5)
    const nonExpiringCredit2 = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      creditType: UsageCreditType.Grant,
      issuedAmount: 50,
      usageMeterId: usageMeter1.id,
      expiresAt: futureExpiryDate.getTime(),
      livemode: subscription.livemode,
    })
    await setupCreditLedgerEntry({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      ledgerTransactionId: baseLedgerTransaction.id,
      ledgerAccountId: ledgerAccount1.id,
      amount: 50,
      entryType: LedgerEntryType.CreditGrantRecognized,
      sourceUsageCreditId: nonExpiringCredit2.id,
      livemode: subscription.livemode,
      usageMeterId: ledgerAccount1.usageMeterId!,
    })

    const result = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return expireCreditsAtEndOfBillingPeriod(
          {
            ledgerAccountsForSubscription: [ledgerAccount1],
            ledgerTransaction: baseLedgerTransaction,
            command: testCommand,
          },
          transaction
        )
      })
    )
      .unwrap()
      .unwrap()

    expect(result.ledgerTransaction).toEqual(baseLedgerTransaction)
    expect(result.ledgerEntries).toBeInstanceOf(Array)
    expect(result.ledgerEntries).toHaveLength(0)
  })

  it('should correctly expire credits that expire exactly at the previous billing period end date', async () => {
    const expiringCreditAmount = 75
    const exactExpiryDate = new Date(
      (testCommand.payload as StandardBillingPeriodTransitionPayload)
        .previousBillingPeriod!.endDate
    )

    const expiringCredit = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      creditType: UsageCreditType.Grant,
      issuedAmount: expiringCreditAmount,
      usageMeterId: usageMeter1.id,
      expiresAt: exactExpiryDate.getTime(),
      livemode: subscription.livemode,
    })
    await setupCreditLedgerEntry({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      ledgerTransactionId: baseLedgerTransaction.id,
      ledgerAccountId: ledgerAccount1.id,
      amount: expiringCreditAmount,
      entryType: LedgerEntryType.CreditGrantRecognized,
      sourceUsageCreditId: expiringCredit.id,
      livemode: subscription.livemode,
      usageMeterId: ledgerAccount1.usageMeterId!,
    })

    const result = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return expireCreditsAtEndOfBillingPeriod(
          {
            ledgerAccountsForSubscription: [ledgerAccount1],
            ledgerTransaction: baseLedgerTransaction,
            command: testCommand,
          },
          transaction
        )
      })
    )
      .unwrap()
      .unwrap()

    expect(result.ledgerTransaction).toEqual(baseLedgerTransaction)
    expect(result.ledgerEntries).toBeInstanceOf(Array)
    expect(result.ledgerEntries).toHaveLength(1)

    const expiredEntry = result.ledgerEntries[0]
    expect(expiredEntry.ledgerTransactionId).toBe(
      baseLedgerTransaction.id
    )
    expect(expiredEntry.ledgerAccountId).toBe(ledgerAccount1.id)
    expect(expiredEntry.subscriptionId).toBe(subscription.id)
    expect(expiredEntry.organizationId).toBe(organization.id)
    expect(expiredEntry.status).toBe(LedgerEntryStatus.Posted)
    expect(expiredEntry.livemode).toBe(testCommand.livemode)
    expect(typeof expiredEntry.entryTimestamp).toBe('number')
    expect(expiredEntry.direction).toBe(LedgerEntryDirection.Debit)
    expect(expiredEntry.entryType).toBe(
      LedgerEntryType.CreditGrantExpired
    )
    expect(expiredEntry.amount).toBe(expiringCreditAmount)
    expect(expiredEntry.description).toBe(
      `Credit grant expired for usage credit ${expiringCredit.id}`
    )
    expect(expiredEntry.metadata).toEqual({})
    expect(expiredEntry.expiredAt).toBeNull()
    expect(expiredEntry.discardedAt).toBeNull()
    expect(expiredEntry.sourceUsageCreditId).toBe(expiringCredit.id)
  })

  it('should correctly calculate the expired amount for a partially used credit', async () => {
    const issuedAmount = 1000
    const usedAmount = 400
    const remainingAmount = issuedAmount - usedAmount
    const expiryDate = new Date(
      (testCommand.payload as StandardBillingPeriodTransitionPayload)
        .previousBillingPeriod!.endDate
    )
    expiryDate.setDate(expiryDate.getDate() - 1)

    const usageCredit = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter1.id,
      creditType: UsageCreditType.Grant,
      issuedAmount,
      expiresAt: expiryDate.getTime(),
      livemode: subscription.livemode,
    })

    const usageEvent = await setupUsageEvent({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter1.id,
      amount: usedAmount,
      priceId: price.id,
      billingPeriodId: previousBillingPeriod.id,
      transactionId: baseLedgerTransaction.id,
      customerId: customer.id,
      livemode: subscription.livemode,
    })

    const usageCreditApplication = await setupUsageCreditApplication({
      organizationId: organization.id,
      usageCreditId: usageCredit.id,
      usageEventId: usageEvent.id,
      amountApplied: usedAmount,
      livemode: subscription.livemode,
    })

    await setupLedgerEntries({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      ledgerAccountId: ledgerAccount1.id,
      ledgerTransactionId: baseLedgerTransaction.id,
      usageMeterId: ledgerAccount1.usageMeterId!,
      entries: [
        {
          entryType: LedgerEntryType.CreditGrantRecognized,
          amount: issuedAmount,
          status: LedgerEntryStatus.Posted,
          sourceUsageCreditId: usageCredit.id,
        },
        {
          entryType:
            LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance,
          amount: usedAmount,
          status: LedgerEntryStatus.Posted,
          sourceUsageCreditId: usageCredit.id,
          sourceCreditApplicationId: usageCreditApplication.id,
          sourceUsageEventId: usageEvent.id,
        },
        // This entry should be ignored by balance calculation for the credit
        {
          entryType:
            LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost,
          amount: usedAmount,
          status: LedgerEntryStatus.Posted,
          sourceUsageCreditId: usageCredit.id,
          sourceCreditApplicationId: usageCreditApplication.id,
          sourceUsageEventId: usageEvent.id,
        },
      ],
    })

    const result = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return expireCreditsAtEndOfBillingPeriod(
          {
            ledgerAccountsForSubscription: [ledgerAccount1],
            ledgerTransaction: baseLedgerTransaction,
            command: testCommand,
          },
          transaction
        )
      })
    )
      .unwrap()
      .unwrap()

    expect(result.ledgerEntries).toHaveLength(1)
    const expiredEntry = result.ledgerEntries[0]
    expect(expiredEntry.entryType).toBe(
      LedgerEntryType.CreditGrantExpired
    )
    expect(expiredEntry.amount).toBe(remainingAmount)
    expect(expiredEntry.sourceUsageCreditId).toBe(usageCredit.id)
  })

  it('should correctly expire credits that expire before the previous billing period end date', async () => {
    const earlyExpiryAmount = 120
    const earlyExpiryDate = new Date(
      (testCommand.payload as StandardBillingPeriodTransitionPayload)
        .previousBillingPeriod!.endDate
    )
    earlyExpiryDate.setDate(earlyExpiryDate.getDate() - 1)

    const earlyExpiringCredit = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      creditType: UsageCreditType.Grant,
      issuedAmount: earlyExpiryAmount,
      usageMeterId: usageMeter1.id,
      expiresAt: earlyExpiryDate.getTime(),
      livemode: subscription.livemode,
    })
    await setupCreditLedgerEntry({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      ledgerTransactionId: baseLedgerTransaction.id,
      ledgerAccountId: ledgerAccount1.id,
      amount: earlyExpiryAmount,
      entryType: LedgerEntryType.CreditGrantRecognized,
      sourceUsageCreditId: earlyExpiringCredit.id,
      livemode: subscription.livemode,
      usageMeterId: ledgerAccount1.usageMeterId!,
    })

    const result = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return expireCreditsAtEndOfBillingPeriod(
          {
            ledgerAccountsForSubscription: [ledgerAccount1],
            ledgerTransaction: baseLedgerTransaction,
            command: testCommand,
          },
          transaction
        )
      })
    )
      .unwrap()
      .unwrap()

    expect(result.ledgerTransaction).toEqual(baseLedgerTransaction)
    expect(result.ledgerEntries).toBeInstanceOf(Array)
    expect(result.ledgerEntries).toHaveLength(1)

    const expiredEntry = result.ledgerEntries[0]
    expect(expiredEntry.ledgerAccountId).toBe(ledgerAccount1.id)
    expect(expiredEntry.amount).toBe(earlyExpiryAmount)
    expect(expiredEntry.entryType).toBe(
      LedgerEntryType.CreditGrantExpired
    )
    expect(expiredEntry.direction).toBe(LedgerEntryDirection.Debit)
    expect(expiredEntry.sourceUsageCreditId).toBe(
      earlyExpiringCredit.id
    )
    expect(expiredEntry.description).toBe(
      `Credit grant expired for usage credit ${earlyExpiringCredit.id}`
    )
  })

  it('should handle a mix of expiring and non-expiring credits correctly', async () => {
    const prevPeriodEndDate = (
      testCommand.payload as StandardBillingPeriodTransitionPayload
    ).previousBillingPeriod!.endDate

    const expiringBeforeAmount = 10
    const expiringBeforeDate = new Date(prevPeriodEndDate)
    expiringBeforeDate.setDate(expiringBeforeDate.getDate() - 2)
    const creditExpiringBefore = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      creditType: UsageCreditType.Grant,
      issuedAmount: expiringBeforeAmount,
      usageMeterId: usageMeter1.id,
      expiresAt: expiringBeforeDate.getTime(),
      livemode: subscription.livemode,
    })
    await setupCreditLedgerEntry({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      ledgerTransactionId: baseLedgerTransaction.id,
      ledgerAccountId: ledgerAccount1.id,
      usageMeterId: ledgerAccount1.usageMeterId!,
      amount: expiringBeforeAmount,
      entryType: LedgerEntryType.CreditGrantRecognized,
      sourceUsageCreditId: creditExpiringBefore.id,
      livemode: subscription.livemode,
    })

    const nonExpiringAfterAmount = 20
    const nonExpiringAfterDate = new Date(prevPeriodEndDate)
    nonExpiringAfterDate.setDate(nonExpiringAfterDate.getDate() + 2)
    const creditNonExpiringAfter = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      creditType: UsageCreditType.Grant,
      issuedAmount: nonExpiringAfterAmount,
      usageMeterId: usageMeter1.id,
      expiresAt: nonExpiringAfterDate.getTime(),
      livemode: subscription.livemode,
    })
    await setupCreditLedgerEntry({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      ledgerTransactionId: baseLedgerTransaction.id,
      ledgerAccountId: ledgerAccount1.id,
      amount: nonExpiringAfterAmount,
      entryType: LedgerEntryType.CreditGrantRecognized,
      sourceUsageCreditId: creditNonExpiringAfter.id,
      livemode: subscription.livemode,
      usageMeterId: ledgerAccount1.usageMeterId!,
    })

    const expiringAtAmount = 30
    const expiringAtDate = new Date(prevPeriodEndDate)
    const creditExpiringAt = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      creditType: UsageCreditType.Grant,
      issuedAmount: expiringAtAmount,
      usageMeterId: usageMeter1.id,
      expiresAt: expiringAtDate.getTime(),
      livemode: subscription.livemode,
    })
    await setupCreditLedgerEntry({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      ledgerTransactionId: baseLedgerTransaction.id,
      ledgerAccountId: ledgerAccount1.id,
      amount: expiringAtAmount,
      entryType: LedgerEntryType.CreditGrantRecognized,
      sourceUsageCreditId: creditExpiringAt.id,
      livemode: subscription.livemode,
      usageMeterId: ledgerAccount1.usageMeterId!,
    })

    const nonExpiringNullAmount = 40
    const creditNonExpiringNull = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      creditType: UsageCreditType.Grant,
      issuedAmount: nonExpiringNullAmount,
      usageMeterId: usageMeter1.id,
      expiresAt: null,
      livemode: subscription.livemode,
    })
    await setupCreditLedgerEntry({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      ledgerTransactionId: baseLedgerTransaction.id,
      ledgerAccountId: ledgerAccount1.id,
      amount: nonExpiringNullAmount,
      entryType: LedgerEntryType.CreditGrantRecognized,
      sourceUsageCreditId: creditNonExpiringNull.id,
      livemode: subscription.livemode,
      usageMeterId: ledgerAccount1.usageMeterId!,
    })

    const result = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return expireCreditsAtEndOfBillingPeriod(
          {
            ledgerAccountsForSubscription: [ledgerAccount1],
            ledgerTransaction: baseLedgerTransaction,
            command: testCommand,
          },
          transaction
        )
      })
    )
      .unwrap()
      .unwrap()

    expect(result.ledgerEntries).toBeInstanceOf(Array)
    expect(result.ledgerEntries).toHaveLength(2)

    const expiredEntryIds = result.ledgerEntries
      .map((e) => e.sourceUsageCreditId)
      .sort()
    const expectedExpiredCreditIds = [
      creditExpiringBefore.id,
      creditExpiringAt.id,
    ].sort()
    expect(expiredEntryIds).toEqual(expectedExpiredCreditIds)

    result.ledgerEntries.forEach((entry) => {
      expect(entry.entryType).toBe(LedgerEntryType.CreditGrantExpired)
      expect(entry.direction).toBe(LedgerEntryDirection.Debit)
      if (entry.sourceUsageCreditId === creditExpiringBefore.id) {
        expect(entry.amount).toBe(expiringBeforeAmount)
      } else if (entry.sourceUsageCreditId === creditExpiringAt.id) {
        expect(entry.amount).toBe(expiringAtAmount)
      }
    })
  })

  it('should correctly map all properties for the CreditGrantExpiredInsert ledger entry, including when livemode is false', async () => {
    const livemodeFalseCommand = {
      ...testCommand,
      livemode: false,
    }

    const detailCheckAmount = 99
    const detailCheckExpiryDate = new Date(
      (testCommand.payload as StandardBillingPeriodTransitionPayload)
        .previousBillingPeriod!.endDate
    )
    detailCheckExpiryDate.setDate(detailCheckExpiryDate.getDate() - 1)

    const detailCredit = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      creditType: UsageCreditType.Grant,
      issuedAmount: detailCheckAmount,
      usageMeterId: usageMeter1.id,
      expiresAt: detailCheckExpiryDate.getTime(),
      livemode: true,
    })
    await setupCreditLedgerEntry({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      ledgerTransactionId: baseLedgerTransaction.id,
      ledgerAccountId: ledgerAccount1.id,
      usageMeterId: ledgerAccount1.usageMeterId!,
      amount: detailCheckAmount,
      entryType: LedgerEntryType.CreditGrantRecognized,
      sourceUsageCreditId: detailCredit.id,
      livemode: true,
    })

    const result = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return expireCreditsAtEndOfBillingPeriod(
          {
            ledgerAccountsForSubscription: [ledgerAccount1],
            ledgerTransaction: baseLedgerTransaction,
            command: livemodeFalseCommand,
          },
          transaction
        )
      })
    )
      .unwrap()
      .unwrap()

    expect(result.ledgerEntries).toBeInstanceOf(Array)
    expect(result.ledgerEntries).toHaveLength(1)
    const expiredEntry = result.ledgerEntries[0]

    expect(expiredEntry.livemode).toBe(false)
    expect(expiredEntry.ledgerTransactionId).toBe(
      baseLedgerTransaction.id
    )
    expect(expiredEntry.ledgerAccountId).toBe(ledgerAccount1.id)
    expect(expiredEntry.subscriptionId).toBe(
      livemodeFalseCommand.subscriptionId
    )
    expect(expiredEntry.organizationId).toBe(
      livemodeFalseCommand.organizationId
    )
    expect(expiredEntry.status).toBe(LedgerEntryStatus.Posted)
    expect(typeof expiredEntry.entryTimestamp).toBe('number')
    expect(expiredEntry.direction).toBe(LedgerEntryDirection.Debit)
    expect(expiredEntry.entryType).toBe(
      LedgerEntryType.CreditGrantExpired
    )
    expect(expiredEntry.amount).toBe(detailCheckAmount)
    expect(expiredEntry.description).toBe(
      `Credit grant expired for usage credit ${detailCredit.id}`
    )
    expect(expiredEntry.metadata).toEqual({})
    expect(expiredEntry.sourceUsageCreditId).toBe(detailCredit.id)
  })
})
