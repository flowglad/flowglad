import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  Mock,
  mock,
} from 'bun:test'
import { and, eq } from 'drizzle-orm'
import {
  setupBillingPeriod,
  // setupProduct is included via setupOrg
  setupBillingRun,
  setupCustomer,
  setupLedgerAccount,
  setupLedgerTransaction,
  setupOrg,
  setupPaymentMethod,
  setupProductFeature,
  setupSubscription,
  setupSubscriptionItem,
  setupSubscriptionItemFeature,
  setupSubscriptionItemFeatureUsageCreditGrant,
  setupUsageCreditGrantFeature,
  setupUsageLedgerScenario,
  setupUsageMeter,
  // setupPrice is included via setupOrg which returns a default price
  teardownOrg,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import db from '@/db/client'
import type {
  BillingPeriodTransitionLedgerCommand,
  StandardBillingPeriodTransitionPayload,
} from '@/db/ledgerManager/ledgerManagerTypes'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { BillingRun } from '@/db/schema/billingRuns'
import type { Customer } from '@/db/schema/customers'
import type { Feature } from '@/db/schema/features'
import {
  type LedgerAccount as LedgerAccountSchema,
  ledgerAccounts,
} from '@/db/schema/ledgerAccounts'
import { LedgerEntry, ledgerEntries } from '@/db/schema/ledgerEntries'
import type { LedgerTransaction as LedgerTransactionSchema } from '@/db/schema/ledgerTransactions'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { ProductFeature } from '@/db/schema/productFeatures'
import type { Product } from '@/db/schema/products'
import {
  SubscriptionItemFeature as DbSubscriptionItemFeature,
  type SubscriptionItemFeature,
} from '@/db/schema/subscriptionItemFeatures'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import { UsageCredit, usageCredits } from '@/db/schema/usageCredits'
import type { UsageMeter } from '@/db/schema/usageMeters'
import {
  aggregateAvailableBalanceForUsageCredit,
  aggregateBalanceForLedgerAccountFromEntries,
  bulkInsertLedgerEntries,
} from '@/db/tableMethods/ledgerEntryMethods'
import { bulkInsertUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import { DbTransaction } from '@/db/types'
import {
  BillingPeriodStatus,
  FeatureType,
  FeatureUsageGrantFrequency,
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  LedgerTransactionType,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
  UsageCreditType,
} from '@/types'
import { grantEntitlementUsageCredits } from './grantEntitlementUsageCredits'

describe('grantEntitlementUsageCredits', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record // Default product from setupOrg
  let basePrice: Price.Record // Default price from setupOrg
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let usageMeter1: UsageMeter.Record // A common usage meter for tests
  let ledgerAccount1: LedgerAccountSchema.Record // Linked to usageMeter1 and subscription
  let ledgerAccountsByUsageMeterId: Map<
    string,
    LedgerAccountSchema.Record
  >
  let testLedgerTransaction: LedgerTransactionSchema.Record // For the command
  let previousBillingPeriod: BillingPeriod.Record
  let newBillingPeriod: BillingPeriod.Record
  let billingRun: BillingRun.Record
  let baseSubscriptionItem: SubscriptionItem.Record
  let baseFeature: Feature.Record
  let baseProductFeature: ProductFeature.Record
  let baseSubscriptionItemFeature: SubscriptionItemFeature.UsageCreditGrantRecord
  let command: BillingPeriodTransitionLedgerCommand
  let commandPayload: BillingPeriodTransitionLedgerCommand['payload']

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    product = orgData.product
    basePrice = orgData.price
    pricingModel = orgData.pricingModel

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
      priceId: basePrice.id, // Using the default flat price from setupOrg
      livemode: true,
    })

    baseSubscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      name: 'Test Base Subscription Item for Grants',
      quantity: 1,
      unitPrice: basePrice.unitPrice,
      priceId: basePrice.id,
    })

    usageMeter1 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter 1 for Grants',
      pricingModelId: pricingModel.id,
      livemode: true,
    })

    baseFeature = await setupUsageCreditGrantFeature({
      organizationId: organization.id,
      name: 'Test Base Feature for Grants',
      usageMeterId: usageMeter1.id,
      amount: 50, // Default grant amount
      renewalFrequency: FeatureUsageGrantFrequency.EveryBillingPeriod,
      livemode: true,
    })

    baseProductFeature = await setupProductFeature({
      organizationId: organization.id,
      productId: product.id,
      featureId: baseFeature.id,
      livemode: true,
    })

    baseSubscriptionItemFeature =
      await setupSubscriptionItemFeatureUsageCreditGrant({
        subscriptionItemId: baseSubscriptionItem.id,
        featureId: baseFeature.id,
        productFeatureId: baseProductFeature.id,
        usageMeterId: usageMeter1.id,
        amount: baseFeature.amount,
      })

    ledgerAccount1 = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter1.id,
      livemode: true,
    })

    ledgerAccountsByUsageMeterId = new Map([
      [usageMeter1.id, ledgerAccount1],
    ])

    testLedgerTransaction = await setupLedgerTransaction({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      type: LedgerTransactionType.BillingPeriodTransition,
      livemode: true,
    })

    const now = new Date()
    previousBillingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // Approx 30 days ago
      endDate: now,
      status: BillingPeriodStatus.Active, // Using Active as a common setup status
      livemode: true,
    })

    newBillingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: now,
      endDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // Approx 30 days in future
      status: BillingPeriodStatus.Active,
      livemode: true,
    })

    billingRun = await setupBillingRun({
      subscriptionId: subscription.id,
      billingPeriodId: previousBillingPeriod.id,
      paymentMethodId: paymentMethod.id,
      livemode: true,
    })

    command = {
      type: LedgerTransactionType.BillingPeriodTransition,
      organizationId: organization.id,
      livemode: true,
      subscriptionId: subscription.id,
      payload: {
        type: 'standard',
        subscription,
        previousBillingPeriod,
        newBillingPeriod,
        subscriptionFeatureItems: [baseSubscriptionItemFeature], // Default to empty; tests will populate this as needed
      },
    }
  })

  afterEach(async () => {
    if (organization) {
      await teardownOrg({ organizationId: organization.id })
    }
  })

  it('should grant a single entitlement usage credit and create corresponding ledger entry', async () => {
    // The command expects items of type Feature.Record with an optional amount override.
    // We use the baseFeature and override its amount for this specific test case.
    command.payload.subscriptionFeatureItems = [
      baseSubscriptionItemFeature,
    ]

    const { usageCredits, ledgerEntries } = await adminTransaction(
      async ({ transaction }) => {
        return await grantEntitlementUsageCredits(
          {
            ledgerAccountsByUsageMeterId,
            ledgerTransaction: testLedgerTransaction,
            command,
          },
          transaction
        )
      }
    )

    expect(usageCredits.length).toBe(1)
    const usageCredit = usageCredits[0]

    expect(usageCredit.organizationId).toBe(organization.id)
    expect(usageCredit.livemode).toBe(command.livemode)
    expect(usageCredit.issuedAmount).toBe(
      baseSubscriptionItemFeature.amount
    )
    expect(usageCredit.status).toBe(UsageCreditStatus.Posted)
    expect(usageCredit.usageMeterId).toBe(usageMeter1.id)
    expect(usageCredit.subscriptionId).toBe(subscription.id)
    expect(usageCredit.expiresAt).toEqual(newBillingPeriod.endDate)
    expect(usageCredit.issuedAmount).toBe(
      baseSubscriptionItemFeature.amount
    )
    expect(typeof usageCredit.issuedAt).toBe('number')
    expect(usageCredit.creditType).toBe(UsageCreditType.Grant)
    expect(usageCredit.sourceReferenceType).toBe(
      UsageCreditSourceReferenceType.BillingPeriodTransition
    )
    expect(usageCredit.paymentId).toBeNull()

    expect(ledgerEntries.length).toBe(1)
    const ledgerEntry = ledgerEntries[0]

    expect(ledgerEntry.ledgerTransactionId).toBe(
      testLedgerTransaction.id
    )
    expect(ledgerEntry.ledgerAccountId).toBe(ledgerAccount1.id)
    expect(ledgerEntry.subscriptionId).toBe(subscription.id)
    expect(ledgerEntry.organizationId).toBe(organization.id)
    expect(ledgerEntry.status).toBe(LedgerEntryStatus.Posted)
    expect(ledgerEntry.livemode).toBe(command.livemode)
    expect(typeof ledgerEntry.entryTimestamp).toBe('number')
    expect(ledgerEntry.amount).toBe(
      baseSubscriptionItemFeature.amount
    )
    expect(ledgerEntry.direction).toBe(LedgerEntryDirection.Credit)
    expect(ledgerEntry.entryType).toBe(
      LedgerEntryType.CreditGrantRecognized
    )
    expect(ledgerEntry.sourceUsageCreditId).toBe(usageCredit.id)
    expect(ledgerEntry.billingPeriodId).toBe(newBillingPeriod.id)

    await adminTransaction(async ({ transaction }) => {
      const balance =
        await aggregateBalanceForLedgerAccountFromEntries(
          { ledgerAccountId: ledgerAccount1.id },
          'available',
          transaction
        )
      expect(balance).toBe(baseSubscriptionItemFeature.amount)
    })
  })

  it('should grant multiple entitlement usage credits and create corresponding ledger entries', async () => {
    // setup:
    const usageMeter2 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter 2 for Grants',
      pricingModelId: pricingModel.id,
      livemode: true,
    })

    const feature2 = await setupUsageCreditGrantFeature({
      organizationId: organization.id,
      name: 'Test Feature 2 for Grants',
      usageMeterId: usageMeter2.id,
      amount: 150, // Default grant amount for feature2
      renewalFrequency: FeatureUsageGrantFrequency.EveryBillingPeriod,
      livemode: true,
    })

    const productFeature2 = await setupProductFeature({
      organizationId: organization.id,
      productId: product.id,
      featureId: feature2.id,
      livemode: true,
    })

    const sif2 = await setupSubscriptionItemFeatureUsageCreditGrant({
      subscriptionItemId: baseSubscriptionItem.id,
      featureId: feature2.id,
      productFeatureId: productFeature2.id,
      usageMeterId: usageMeter2.id,
      amount: feature2.amount, // Use default amount from feature2
    })

    const ledgerAccount2 = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter2.id,
      livemode: true,
    })

    ledgerAccountsByUsageMeterId.set(usageMeter2.id, ledgerAccount2)

    const amount1 = 200
    const amount2 = 300

    command.payload.subscriptionFeatureItems = [
      { ...baseSubscriptionItemFeature, amount: amount1 },
      { ...sif2, amount: amount2 },
    ]

    const {
      usageCredits: createdUsageCredits,
      ledgerEntries: createdLedgerEntries,
    } = await adminTransaction(async ({ transaction }) => {
      return await grantEntitlementUsageCredits(
        {
          ledgerAccountsByUsageMeterId,
          ledgerTransaction: testLedgerTransaction,
          command,
        },
        transaction
      )
    })

    expect(createdUsageCredits.length).toBe(2)
    // Sort by usageMeterId to ensure consistent order for assertions
    const sortedUsageCredits = [...createdUsageCredits].sort((a, b) =>
      a.usageMeterId.localeCompare(b.usageMeterId)
    )
    const usageCredit1 = sortedUsageCredits.find(
      (uc) => uc.usageMeterId === usageMeter1.id
    )
    const usageCredit2 = sortedUsageCredits.find(
      (uc) => uc.usageMeterId === usageMeter2.id
    )

    expect(usageCredit1).toMatchObject({
      organizationId: organization.id,
    })

    // Assertions for the first usage credit (linked to usageMeter1)
    expect(usageCredit1!.organizationId).toBe(organization.id)
    expect(usageCredit1!.livemode).toBe(command.livemode)
    expect(usageCredit1!.issuedAmount).toBe(amount1)
    expect(usageCredit1!.status).toBe(UsageCreditStatus.Posted)
    expect(usageCredit1!.usageMeterId).toBe(usageMeter1.id)
    expect(usageCredit1!.subscriptionId).toBe(subscription.id)
    expect(usageCredit1!.expiresAt).toEqual(newBillingPeriod.endDate)
    expect(typeof usageCredit1!.issuedAt).toBe('number')
    expect(usageCredit1!.creditType).toBe(UsageCreditType.Grant)
    expect(usageCredit1!.sourceReferenceType).toBe(
      UsageCreditSourceReferenceType.BillingPeriodTransition
    )
    expect(usageCredit1!.paymentId).toBeNull()

    // Assertions for the second usage credit (linked to usageMeter2)
    expect(usageCredit2!.organizationId).toBe(organization.id)
    expect(usageCredit2!.livemode).toBe(command.livemode)
    expect(usageCredit2!.issuedAmount).toBe(amount2)
    expect(usageCredit2!.status).toBe(UsageCreditStatus.Posted)
    expect(usageCredit2!.usageMeterId).toBe(usageMeter2.id)
    expect(usageCredit2!.subscriptionId).toBe(subscription.id)
    expect(usageCredit2!.expiresAt).toEqual(newBillingPeriod.endDate)
    expect(typeof usageCredit2!.issuedAt).toBe('number')
    expect(usageCredit2!.creditType).toBe(UsageCreditType.Grant)
    expect(usageCredit2!.sourceReferenceType).toBe(
      UsageCreditSourceReferenceType.BillingPeriodTransition
    )
    expect(usageCredit2!.paymentId).toBeNull()

    expect(createdLedgerEntries.length).toBe(2)
    // Sort by ledgerAccountId to ensure consistent order for assertions
    // (or by sourceUsageCreditId if ledgerAccountId isn't unique enough in some complex scenario)
    const sortedLedgerEntries = [...createdLedgerEntries].sort(
      (a, b) => a.ledgerAccountId.localeCompare(b.ledgerAccountId)
    )
    const ledgerEntry1 = sortedLedgerEntries.find(
      (le) => le.ledgerAccountId === ledgerAccount1.id
    )
    const ledgerEntry2 = sortedLedgerEntries.find(
      (le) => le.ledgerAccountId === ledgerAccount2.id
    )

    // Assertions for the first ledger entry (linked to ledgerAccount1)
    expect(ledgerEntry1!.ledgerTransactionId).toBe(
      testLedgerTransaction.id
    )
    expect(ledgerEntry1!.ledgerAccountId).toBe(ledgerAccount1.id)
    expect(ledgerEntry1!.subscriptionId).toBe(subscription.id)
    expect(ledgerEntry1!.organizationId).toBe(organization.id)
    expect(ledgerEntry1!.status).toBe(LedgerEntryStatus.Posted)
    expect(ledgerEntry1!.livemode).toBe(command.livemode)
    expect(typeof ledgerEntry1!.entryTimestamp).toBe('number')
    expect(ledgerEntry1!.amount).toBe(amount1)
    expect(ledgerEntry1!.direction).toBe(LedgerEntryDirection.Credit)
    expect(ledgerEntry1!.entryType).toBe(
      LedgerEntryType.CreditGrantRecognized
    )
    expect(ledgerEntry1!.sourceUsageCreditId).toBe(usageCredit1!.id)
    expect(ledgerEntry1!.billingPeriodId).toBe(newBillingPeriod.id)

    // Assertions for the second ledger entry (linked to ledgerAccount2)
    expect(ledgerEntry2!.ledgerTransactionId).toBe(
      testLedgerTransaction.id
    )
    expect(ledgerEntry2!.ledgerAccountId).toBe(ledgerAccount2.id)
    expect(ledgerEntry2!.subscriptionId).toBe(subscription.id)
    expect(ledgerEntry2!.organizationId).toBe(organization.id)
    expect(ledgerEntry2!.status).toBe(LedgerEntryStatus.Posted)
    expect(ledgerEntry2!.livemode).toBe(command.livemode)
    expect(typeof ledgerEntry2!.entryTimestamp).toBe('number')
    expect(ledgerEntry2!.amount).toBe(amount2)
    expect(ledgerEntry2!.direction).toBe(LedgerEntryDirection.Credit)
    expect(ledgerEntry2!.entryType).toBe(
      LedgerEntryType.CreditGrantRecognized
    )
    expect(ledgerEntry2!.sourceUsageCreditId).toBe(usageCredit2!.id)
    expect(ledgerEntry2!.billingPeriodId).toBe(newBillingPeriod.id)

    await adminTransaction(async ({ transaction }) => {
      const balance1 =
        await aggregateBalanceForLedgerAccountFromEntries(
          { ledgerAccountId: ledgerAccount1.id },
          'available',
          transaction
        )
      expect(balance1).toBe(amount1)
      const balance2 =
        await aggregateBalanceForLedgerAccountFromEntries(
          { ledgerAccountId: ledgerAccount2.id },
          'available',
          transaction
        )
      expect(balance2).toBe(amount2)
    })
  })

  it('should only process feature items with usageMeterIds', async () => {
    const amountWithMeter = 50
    const amountWithoutMeter = 150

    // Item with a usage meter (based on baseSubscriptionItemFeature)
    const itemWithMeter = {
      ...baseSubscriptionItemFeature,
      amount: amountWithMeter,
    }

    // Item without a usage meter
    // We are testing the function's robustness to an item that might appear in the
    // subscriptionFeatureItems array but lacks a usageMeterId.
    // The type assertion (as any) is to allow `null` for `usageMeterId` which is normally a string.
    const itemWithoutMeter = {
      ...baseSubscriptionItemFeature, // Spread to get most valid properties
      id: 'sif_without_meter_test', // Ensure a unique ID if it were a real DB record
      subscriptionItemFeatureId: 'sif_id_without_meter', // a unique SIF id
      usageMeterId: null as any, // CRITICAL: Set usageMeterId to null. `as any` bypasses strict typing for test.
      amount: amountWithoutMeter, // This amount should be ignored
      // Keep other properties from baseSubscriptionItemFeature to make it a valid object otherwise
      // The function should specifically check for usageMeterId
      featureId: 'feature_id_for_no_meter_sif', // Can be a distinct feature id
      productFeatureId: 'product_feature_id_for_no_meter_sif', // Can be a distinct product feature id
      name: 'Test SIF Without Meter',
      // The nested productFeature and feature can be from baseSubscriptionItemFeature
      // as the function under test should primarily operate on top-level SIF properties.
    } as SubscriptionItemFeature.UsageCreditGrantRecord // Still cast to the expected type
    command.payload.subscriptionFeatureItems = [
      itemWithMeter,
      itemWithoutMeter,
    ]

    const {
      usageCredits: createdUsageCredits,
      ledgerEntries: createdLedgerEntries,
    } = await adminTransaction(async ({ transaction }) => {
      return await grantEntitlementUsageCredits(
        {
          ledgerAccountsByUsageMeterId,
          ledgerTransaction: testLedgerTransaction,
          command,
        },
        transaction
      )
    })

    expect(createdUsageCredits.length).toBe(1)
    const usageCredit = createdUsageCredits[0]

    expect(usageCredit.organizationId).toBe(organization.id)
    expect(usageCredit.livemode).toBe(command.livemode)
    expect(usageCredit.issuedAmount).toBe(amountWithMeter) // Only the item with meter should be processed
    expect(usageCredit.status).toBe(UsageCreditStatus.Posted)
    expect(usageCredit.usageMeterId).toBe(usageMeter1.id) // Linked to the one with meter
    expect(usageCredit.subscriptionId).toBe(subscription.id)
    expect(usageCredit.expiresAt).toEqual(newBillingPeriod.endDate)
    expect(typeof usageCredit.issuedAt).toBe('number')
    expect(usageCredit.creditType).toBe(UsageCreditType.Grant)
    expect(usageCredit.sourceReferenceType).toBe(
      UsageCreditSourceReferenceType.BillingPeriodTransition
    )

    expect(createdLedgerEntries.length).toBe(1)
    const ledgerEntry = createdLedgerEntries[0]

    expect(ledgerEntry.ledgerTransactionId).toBe(
      testLedgerTransaction.id
    )
    expect(ledgerEntry.ledgerAccountId).toBe(ledgerAccount1.id) // Linked to the account of the metered item
    expect(ledgerEntry.subscriptionId).toBe(subscription.id)
    expect(ledgerEntry.organizationId).toBe(organization.id)
    expect(ledgerEntry.status).toBe(LedgerEntryStatus.Posted)
    expect(ledgerEntry.livemode).toBe(command.livemode)
    expect(typeof ledgerEntry.entryTimestamp).toBe('number')
    expect(ledgerEntry.amount).toBe(amountWithMeter) // Amount from the metered item
    expect(ledgerEntry.direction).toBe(LedgerEntryDirection.Credit)
    expect(ledgerEntry.entryType).toBe(
      LedgerEntryType.CreditGrantRecognized
    )
    expect(ledgerEntry.sourceUsageCreditId).toBe(usageCredit.id)
    expect(ledgerEntry.billingPeriodId).toBe(newBillingPeriod.id)

    await adminTransaction(async ({ transaction }) => {
      const balance =
        await aggregateBalanceForLedgerAccountFromEntries(
          { ledgerAccountId: ledgerAccount1.id },
          'available',
          transaction
        )
      expect(balance).toBe(amountWithMeter)
    })
  })

  it('should handle cases with no feature items having usageMeterIds', async () => {
    // Option B: Construct a feature item without a usageMeterId
    const amountWithoutMeter = 100

    const itemWithoutMeterOnly = {
      ...baseSubscriptionItemFeature,
      id: 'sif_only_no_meter_test',
      subscriptionItemFeatureId: 'sif_id_only_no_meter',
      usageMeterId: null as any, // CRITICAL: Set usageMeterId to null
      amount: amountWithoutMeter, // This amount should be ignored
      featureId: 'feature_id_for_only_no_meter_sif',
      productFeatureId: 'product_feature_id_for_only_no_meter_sif',
      name: 'Test SIF Only Without Meter',
    } as SubscriptionItemFeature.UsageCreditGrantRecord

    command.payload.subscriptionFeatureItems = [itemWithoutMeterOnly]

    const {
      usageCredits: createdUsageCredits,
      ledgerEntries: createdLedgerEntries,
    } = await adminTransaction(async ({ transaction }) => {
      return await grantEntitlementUsageCredits(
        {
          ledgerAccountsByUsageMeterId,
          ledgerTransaction: testLedgerTransaction,
          command,
        },
        transaction
      )
    })

    // Expects:
    // - Query the `usageCredits` table:
    //   - Expect 0 UsageCredit records to be created for this command.subscriptionId and newBillingPeriod.id.
    expect(createdUsageCredits.length).toBe(0)

    // - Query the `ledgerEntries` table (filtered by testLedgerTransaction.id):
    //   - Expect 0 LedgerEntry records of type CreditGrantRecognized.
    expect(createdLedgerEntries.length).toBe(0)

    await adminTransaction(async ({ transaction }) => {
      const balance =
        await aggregateBalanceForLedgerAccountFromEntries(
          { ledgerAccountId: ledgerAccount1.id },
          'available',
          transaction
        )
      expect(balance).toBe(0)
    })
  })

  it('should correctly propagate livemode: false to usage credits and ledger entries', async () => {
    const testAmount = 75
    command.livemode = false // CRITICAL: Set command livemode to false

    // The baseSubscriptionItemFeature is created with livemode: true in beforeEach.
    // The grantEntitlementUsageCredits function should use command.livemode for new records.
    command.payload.subscriptionFeatureItems = [
      { ...baseSubscriptionItemFeature, amount: testAmount },
    ]

    const {
      usageCredits: createdUsageCredits,
      ledgerEntries: createdLedgerEntries,
    } = await adminTransaction(async ({ transaction }) => {
      return await grantEntitlementUsageCredits(
        {
          ledgerAccountsByUsageMeterId,
          ledgerTransaction: testLedgerTransaction,
          command, // command now has livemode: false
        },
        transaction
      )
    })

    expect(createdUsageCredits.length).toBe(1)
    const usageCredit = createdUsageCredits[0]

    // Verify UsageCredit properties, especially livemode
    expect(usageCredit.organizationId).toBe(organization.id)
    expect(usageCredit.livemode).toBe(false) // IMPORTANT CHECK
    expect(usageCredit.issuedAmount).toBe(testAmount)
    expect(usageCredit.status).toBe(UsageCreditStatus.Posted)
    expect(usageCredit.usageMeterId).toBe(usageMeter1.id)
    expect(usageCredit.subscriptionId).toBe(subscription.id)
    expect(usageCredit.expiresAt).toEqual(newBillingPeriod.endDate)
    expect(typeof usageCredit.issuedAt).toBe('number')
    expect(usageCredit.creditType).toBe(UsageCreditType.Grant)
    expect(usageCredit.sourceReferenceType).toBe(
      UsageCreditSourceReferenceType.BillingPeriodTransition
    )
    expect(usageCredit.paymentId).toBeNull()

    expect(createdLedgerEntries.length).toBe(1)
    const ledgerEntry = createdLedgerEntries[0]

    // Verify LedgerEntry properties, especially livemode
    expect(ledgerEntry.ledgerTransactionId).toBe(
      testLedgerTransaction.id
    )
    expect(ledgerEntry.ledgerAccountId).toBe(ledgerAccount1.id)
    expect(ledgerEntry.subscriptionId).toBe(subscription.id)
    expect(ledgerEntry.organizationId).toBe(organization.id)
    expect(ledgerEntry.status).toBe(LedgerEntryStatus.Posted)
    expect(ledgerEntry.livemode).toBe(false) // IMPORTANT CHECK
    expect(typeof ledgerEntry.entryTimestamp).toBe('number')
    expect(ledgerEntry.amount).toBe(testAmount)
    expect(ledgerEntry.direction).toBe(LedgerEntryDirection.Credit)
    expect(ledgerEntry.entryType).toBe(
      LedgerEntryType.CreditGrantRecognized
    )
    expect(ledgerEntry.sourceUsageCreditId).toBe(usageCredit.id)
    expect(ledgerEntry.billingPeriodId).toBe(newBillingPeriod.id)

    await adminTransaction(async ({ transaction }) => {
      const balance =
        await aggregateBalanceForLedgerAccountFromEntries(
          { ledgerAccountId: ledgerAccount1.id },
          'available',
          transaction
        )
      expect(balance).toBe(testAmount)
    })
  })

  it('should create ledger accounts for usage meters that do not yet have accounts in this subscription', async () => {
    const amountForBaseSif = 50
    const amountForNewSif = 100

    // 1. Create a second usage meter (usageMeter2)
    const usageMeter2 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter 2 for Auto Account Creation',
      pricingModelId: pricingModel.id,
      livemode: true,
    })

    // 2. Create a new feature (feature2) linked to usageMeter2
    const feature2 = await setupUsageCreditGrantFeature({
      organizationId: organization.id,
      name: 'Test Feature 2 for Auto Account Creation',
      usageMeterId: usageMeter2.id,
      amount: amountForNewSif, // Default amount for this feature
      renewalFrequency: FeatureUsageGrantFrequency.EveryBillingPeriod,
      livemode: true,
      pricingModelId: pricingModel.id,
    })

    // 3. Create a product feature for feature2
    const productFeature2 = await setupProductFeature({
      organizationId: organization.id,
      productId: product.id, // Using the existing product
      featureId: feature2.id,
      livemode: true,
    })

    // 4. Create a subscription item feature for feature2
    const sif2 = await setupSubscriptionItemFeatureUsageCreditGrant({
      subscriptionItemId: baseSubscriptionItem.id, // Using the existing subscription item
      featureId: feature2.id,
      productFeatureId: productFeature2.id,
      usageMeterId: usageMeter2.id,
      amount: amountForNewSif,
    })

    // 5. Update command.payload.subscriptionFeatureItems
    command.payload.subscriptionFeatureItems = [
      { ...baseSubscriptionItemFeature, amount: amountForBaseSif },
      sif2, // sif2 already has the amount set
    ]

    // 6. IMPORTANT: ledgerAccountsByUsageMeterId intentionally does NOT contain usageMeter2's account
    // It only contains ledgerAccount1 for usageMeter1 from the beforeEach setup.
    // The function is expected to create the new ledger account.

    const {
      usageCredits: createdUsageCredits,
      ledgerEntries: createdLedgerEntries,
    } = await adminTransaction(async ({ transaction }) => {
      // The ledgerAccountsByUsageMeterId passed here is the original one from beforeEach
      return await grantEntitlementUsageCredits(
        {
          ledgerAccountsByUsageMeterId, // This map is intentionally missing usageMeter2's account
          ledgerTransaction: testLedgerTransaction,
          command,
        },
        transaction
      )
    })

    // Assertions:
    // 1. Ledger Accounts
    const allSubscriptionLedgerAccounts = await db
      .select()
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.subscriptionId, subscription.id))

    expect(allSubscriptionLedgerAccounts.length).toBe(2)

    const originalLedgerAccount = allSubscriptionLedgerAccounts.find(
      (acc) => acc.usageMeterId === usageMeter1.id
    ) as LedgerAccountSchema.Record | undefined // Cast to be sure about the type
    const newLedgerAccount = allSubscriptionLedgerAccounts.find(
      (acc) => acc.usageMeterId === usageMeter2.id
    ) as LedgerAccountSchema.Record | undefined // Cast to ensure type includes balance

    expect(originalLedgerAccount?.id).toBe(ledgerAccount1.id)

    expect(newLedgerAccount?.organizationId).toBe(organization.id)
    expect(newLedgerAccount?.subscriptionId).toBe(subscription.id)
    expect(newLedgerAccount?.usageMeterId).toBe(usageMeter2.id)
    expect(newLedgerAccount?.livemode).toBe(command.livemode)
    const newBalance = await adminTransaction(
      async ({ transaction }) => {
        return await aggregateBalanceForLedgerAccountFromEntries(
          {
            ledgerAccountId: newLedgerAccount?.id!,
          },
          'available',
          transaction
        )
      }
    )
    expect(newBalance).toBe(amountForNewSif) // Initial balance after grant

    // 2. Usage Credits
    expect(createdUsageCredits.length).toBe(2)
    const sortedUsageCredits = [...createdUsageCredits].sort((a, b) =>
      a.usageMeterId.localeCompare(b.usageMeterId)
    )
    const uc1 = sortedUsageCredits.find(
      (uc) => uc.usageMeterId === usageMeter1.id
    )
    const uc2 = sortedUsageCredits.find(
      (uc) => uc.usageMeterId === usageMeter2.id
    )

    expect(uc1?.issuedAmount).toBe(amountForBaseSif)
    expect(uc1?.usageMeterId).toBe(usageMeter1.id)

    expect(uc2?.issuedAmount).toBe(amountForNewSif)
    expect(uc2?.usageMeterId).toBe(usageMeter2.id)

    // 3. Ledger Entries
    expect(createdLedgerEntries.length).toBe(2)
    const sortedLedgerEntries = [...createdLedgerEntries].sort(
      (a, b) => {
        // Need a reliable way to sort. Assuming sourceUsageCreditId is unique and links back.
        // Or, if newLedgerAccount is defined, use its ID.
        if (a.sourceUsageCreditId === uc1?.id) return -1
        if (b.sourceUsageCreditId === uc1?.id) return 1
        if (a.sourceUsageCreditId === uc2?.id) return -1
        if (b.sourceUsageCreditId === uc2?.id) return 1
        return 0
      }
    )

    const le1 = sortedLedgerEntries.find(
      (le) => le.sourceUsageCreditId === uc1?.id
    )
    const le2 = sortedLedgerEntries.find(
      (le) => le.sourceUsageCreditId === uc2?.id
    )

    expect(le1?.ledgerAccountId).toBe(originalLedgerAccount?.id)
    expect(le1?.amount).toBe(amountForBaseSif)
    expect(le1?.entryType).toBe(LedgerEntryType.CreditGrantRecognized)

    expect(le2?.ledgerAccountId).toBe(newLedgerAccount?.id)
    expect(le2?.amount).toBe(amountForNewSif)
    expect(le2?.entryType).toBe(LedgerEntryType.CreditGrantRecognized)

    await adminTransaction(async ({ transaction }) => {
      const originalBalance =
        await aggregateBalanceForLedgerAccountFromEntries(
          { ledgerAccountId: originalLedgerAccount!.id },
          'available',
          transaction
        )
      expect(originalBalance).toBe(amountForBaseSif)

      const newBalance =
        await aggregateBalanceForLedgerAccountFromEntries(
          { ledgerAccountId: newLedgerAccount!.id },
          'available',
          transaction
        )
      expect(newBalance).toBe(amountForNewSif)
    })
  })

  describe('Grant Frequency Logic', () => {
    it('should grant both "Once" and "EveryBillingPeriod" credits on initial grant (previousBillingPeriod is null)', async () => {
      // Setup
      const standardPayload =
        command.payload as StandardBillingPeriodTransitionPayload
      standardPayload.previousBillingPeriod = null // Simulate initial grant

      const usageMeter2 = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Test Usage Meter 2 for Initial Grant',
        pricingModelId: pricingModel.id,
        livemode: true,
      })
      const featureOnce = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        name: 'One-Time Grant Feature',
        usageMeterId: usageMeter1.id, // Use existing meter
        amount: 1000,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        livemode: true,
      })
      const productFeatureOnce = await setupProductFeature({
        organizationId: organization.id,
        productId: product.id,
        featureId: featureOnce.id,
      })
      const sifOnce =
        await setupSubscriptionItemFeatureUsageCreditGrant({
          subscriptionItemId: baseSubscriptionItem.id,
          featureId: featureOnce.id,
          productFeatureId: productFeatureOnce.id,
          usageMeterId: usageMeter1.id,
          amount: featureOnce.amount,
          renewalFrequency: featureOnce.renewalFrequency,
        })

      const featureEvery = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        name: 'Recurring Grant Feature',
        usageMeterId: usageMeter2.id,
        amount: 500,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        livemode: true,
      })
      const productFeatureEvery = await setupProductFeature({
        organizationId: organization.id,
        productId: product.id,
        featureId: featureEvery.id,
      })
      const sifEvery =
        await setupSubscriptionItemFeatureUsageCreditGrant({
          subscriptionItemId: baseSubscriptionItem.id,
          featureId: featureEvery.id,
          productFeatureId: productFeatureEvery.id,
          usageMeterId: usageMeter2.id,
          amount: featureEvery.amount,
          renewalFrequency: featureEvery.renewalFrequency,
        })

      command.payload.subscriptionFeatureItems = [sifOnce, sifEvery]
      // Ledger account for usageMeter2 will be auto-created

      // Action
      const { usageCredits, ledgerEntries } = await adminTransaction(
        async ({ transaction }) => {
          return await grantEntitlementUsageCredits(
            {
              ledgerAccountsByUsageMeterId,
              ledgerTransaction: testLedgerTransaction,
              command,
            },
            transaction
          )
        }
      )

      // Assert
      expect(usageCredits.length).toBe(2)
      expect(ledgerEntries.length).toBe(2)

      const onceCredit = usageCredits.find(
        (uc) => uc.usageMeterId === usageMeter1.id
      )
      const everyCredit = usageCredits.find(
        (uc) => uc.usageMeterId === usageMeter2.id
      )

      expect(onceCredit?.issuedAmount).toBe(featureOnce.amount)
      expect(onceCredit?.expiresAt).toBeNull() // One-time grants should not expire

      expect(everyCredit?.issuedAmount).toBe(featureEvery.amount)
      expect(everyCredit?.expiresAt).toEqual(
        standardPayload.newBillingPeriod.endDate
      ) // Recurring grants should expire

      // Verify balances
      await adminTransaction(async ({ transaction }) => {
        const balance1 =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount1.id },
            'available',
            transaction
          )
        expect(balance1).toBe(featureOnce.amount)

        const ledgerAccount2 = (
          await transaction
            .select()
            .from(ledgerAccounts)
            .where(
              and(
                eq(ledgerAccounts.subscriptionId, subscription.id),
                eq(ledgerAccounts.usageMeterId, usageMeter2.id)
              )
            )
        )[0]

        const balance2 =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount2.id },
            'available',
            transaction
          )
        expect(balance2).toBe(featureEvery.amount)
      })
    })

    it('should only grant "EveryBillingPeriod" credits on subsequent grants (previousBillingPeriod exists)', async () => {
      // Setup
      // command.payload.previousBillingPeriod is already set in beforeEach, so this is a subsequent grant.

      const usageMeter2 = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Test Usage Meter 2 for Subsequent Grant',
        pricingModelId: pricingModel.id,
        livemode: true,
      })
      const featureOnce = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        name: 'One-Time Grant Feature To Be Ignored',
        usageMeterId: usageMeter1.id, // Use existing meter
        amount: 1000,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        livemode: true,
      })
      const productFeatureOnce = await setupProductFeature({
        organizationId: organization.id,
        productId: product.id,
        featureId: featureOnce.id,
      })
      const sifOnce =
        await setupSubscriptionItemFeatureUsageCreditGrant({
          subscriptionItemId: baseSubscriptionItem.id,
          featureId: featureOnce.id,
          productFeatureId: productFeatureOnce.id,
          usageMeterId: usageMeter1.id,
          amount: featureOnce.amount,
          renewalFrequency: featureOnce.renewalFrequency,
        })

      const featureEvery = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        name: 'Recurring Grant Feature To Be Granted',
        usageMeterId: usageMeter2.id,
        amount: 500,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        livemode: true,
      })
      const productFeatureEvery = await setupProductFeature({
        organizationId: organization.id,
        productId: product.id,
        featureId: featureEvery.id,
      })
      const sifEvery =
        await setupSubscriptionItemFeatureUsageCreditGrant({
          subscriptionItemId: baseSubscriptionItem.id,
          featureId: featureEvery.id,
          productFeatureId: productFeatureEvery.id,
          usageMeterId: usageMeter2.id,
          amount: featureEvery.amount,
          renewalFrequency: featureEvery.renewalFrequency,
        })

      command.payload.subscriptionFeatureItems = [sifOnce, sifEvery]

      // Action
      const { usageCredits, ledgerEntries } = await adminTransaction(
        async ({ transaction }) => {
          return await grantEntitlementUsageCredits(
            {
              ledgerAccountsByUsageMeterId,
              ledgerTransaction: testLedgerTransaction,
              command,
            },
            transaction
          )
        }
      )

      // Assert
      expect(usageCredits.length).toBe(1)
      expect(ledgerEntries.length).toBe(1)
      const grantedCredit = usageCredits[0]
      const standardPayload =
        command.payload as StandardBillingPeriodTransitionPayload
      expect(grantedCredit.usageMeterId).toBe(usageMeter2.id)
      expect(grantedCredit.issuedAmount).toBe(featureEvery.amount)
      expect(grantedCredit.expiresAt).toEqual(
        standardPayload.newBillingPeriod.endDate
      ) // Recurring grants should expire

      // Verify balances
      await adminTransaction(async ({ transaction }) => {
        const balance1 =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount1.id },
            'available',
            transaction
          )
        expect(balance1).toBe(0) // No "Once" grant was issued

        const ledgerAccount2 = (
          await transaction
            .select()
            .from(ledgerAccounts)
            .where(
              and(
                eq(ledgerAccounts.subscriptionId, subscription.id),
                eq(ledgerAccounts.usageMeterId, usageMeter2.id)
              )
            )
        )[0]

        const balance2 =
          await aggregateBalanceForLedgerAccountFromEntries(
            { ledgerAccountId: ledgerAccount2.id },
            'available',
            transaction
          )
        expect(balance2).toBe(featureEvery.amount)
      })
    })

    it('should grant no credits on a subsequent grant if only "Once" entitlements exist', async () => {
      // Setup
      // command.payload.previousBillingPeriod is already set, so this is a subsequent grant.
      const featureOnce = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        name: 'One-Time Grant Feature To Be Ignored',
        usageMeterId: usageMeter1.id,
        amount: 1000,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        livemode: true,
      })
      const productFeatureOnce = await setupProductFeature({
        organizationId: organization.id,
        productId: product.id,
        featureId: featureOnce.id,
      })
      const sifOnce =
        await setupSubscriptionItemFeatureUsageCreditGrant({
          subscriptionItemId: baseSubscriptionItem.id,
          featureId: featureOnce.id,
          productFeatureId: productFeatureOnce.id,
          usageMeterId: usageMeter1.id,
          amount: featureOnce.amount,
          renewalFrequency: featureOnce.renewalFrequency,
        })

      command.payload.subscriptionFeatureItems = [sifOnce]

      // Action
      const { usageCredits, ledgerEntries } = await adminTransaction(
        async ({ transaction }) => {
          return await grantEntitlementUsageCredits(
            {
              ledgerAccountsByUsageMeterId,
              ledgerTransaction: testLedgerTransaction,
              command,
            },
            transaction
          )
        }
      )

      // Assert
      expect(usageCredits.length).toBe(0)
      expect(ledgerEntries.length).toBe(0)

      // Verify balance
      await adminTransaction(async ({ transaction }) => {
        const balance =
          await aggregateBalanceForLedgerAccountFromEntries(
            {
              ledgerAccountId: ledgerAccount1.id,
            },
            'available',
            transaction
          )
        expect(balance).toBe(0)
      })
    })
  })
})
