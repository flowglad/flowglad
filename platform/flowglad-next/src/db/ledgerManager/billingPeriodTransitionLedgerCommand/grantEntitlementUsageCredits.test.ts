import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  Mock,
} from 'vitest'
import { grantEntitlementUsageCredits } from './grantEntitlementUsageCredits'
import { BillingPeriodTransitionLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import {
  LedgerAccount,
  LedgerAccount as LedgerAccountSchema,
} from '@/db/schema/ledgerAccounts'
import { LedgerTransaction as LedgerTransactionSchema } from '@/db/schema/ledgerTransactions'
import { UsageCredit, usageCredits } from '@/db/schema/usageCredits'
import { LedgerEntry, ledgerEntries } from '@/db/schema/ledgerEntries'
import { DbTransaction } from '@/db/types'
import {
  LedgerTransactionType,
  BillingPeriodStatus,
  FeatureUsageGrantFrequency,
  LedgerEntryStatus,
  LedgerEntryDirection,
  LedgerEntryType,
  UsageCreditStatus,
  UsageCreditType,
  UsageCreditSourceReferenceType,
  FeatureType,
} from '@/types'
import {
  setupOrg,
  setupCustomer,
  setupSubscription,
  setupLedgerAccount,
  setupLedgerTransaction,
  setupUsageMeter,
  // setupPrice is included via setupOrg which returns a default price
  teardownOrg,
  setupPaymentMethod,
  setupBillingPeriod,
  // setupProduct is included via setupOrg
  setupBillingRun,
  setupSubscriptionItem,
  setupUsageCreditGrantFeature,
  setupSubscriptionItemFeature,
  setupProductFeature,
  setupSubscriptionItemFeatureUsageCreditGrant,
} from '@/../seedDatabase'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { Customer } from '@/db/schema/customers'
import { Subscription } from '@/db/schema/subscriptions'
import { UsageMeter } from '@/db/schema/usageMeters'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Catalog } from '@/db/schema/catalogs'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { BillingRun } from '@/db/schema/billingRuns'
import { bulkInsertUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import { bulkInsertLedgerEntries } from '@/db/tableMethods/ledgerEntryMethods'
import {
  SubscriptionItemFeature as DbSubscriptionItemFeature,
  SubscriptionItemFeature,
} from '@/db/schema/subscriptionItemFeatures'
import { adminTransaction } from '@/db/adminTransaction'
import { eq, and } from 'drizzle-orm'
import { ProductFeature } from '@/db/schema/productFeatures'
import { Feature } from '@/db/schema/features'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import db from '@/db/client'

describe('grantEntitlementUsageCredits', () => {
  let organization: Organization.Record
  let catalog: Catalog.Record
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
  let baseSubscriptionItemFeature: SubscriptionItemFeature.UsageCreditGrantClientRecord
  let command: BillingPeriodTransitionLedgerCommand
  let commandPayload: BillingPeriodTransitionLedgerCommand['payload']

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    product = orgData.product
    basePrice = orgData.price
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
      catalogId: catalog.id,
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
        billingRunId: billingRun.id,
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
    expect(usageCredit.issuedAt).toBeInstanceOf(Date)
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
    expect(ledgerEntry.entryTimestamp).toBeInstanceOf(Date)
    expect(ledgerEntry.amount).toBe(
      baseSubscriptionItemFeature.amount
    )
    expect(ledgerEntry.direction).toBe(LedgerEntryDirection.Credit)
    expect(ledgerEntry.entryType).toBe(
      LedgerEntryType.CreditGrantRecognized
    )
    expect(ledgerEntry.sourceUsageCreditId).toBe(usageCredit.id)
    expect(ledgerEntry.billingPeriodId).toBe(newBillingPeriod.id)
  })

  it('should grant multiple entitlement usage credits and create corresponding ledger entries', async () => {
    // setup:
    // - Create a second usageMeter (usageMeter2) and its corresponding ledgerAccount (ledgerAccount2).
    // - Create a second feature (feature2) linked to usageMeter2.
    // - Create a second productFeature (productFeature2) for feature2.
    // - Create a second subscriptionItemFeature (sif2) for baseSubscriptionItem, feature2, productFeature2, and usageMeter2.
    // - Add ledgerAccount2 to `ledgerAccountsByUsageMeterId`.
    // - Update command.payload.subscriptionFeatureItems = [
    //     { ...baseSubscriptionItemFeature, amount: 200 },
    //     { ...sif2, amount: 300 }
    //   ].
    // expects:
    // - Call grantEntitlementUsageCredits within an adminTransaction.
    // - Query the `usageCredits` table:
    //   - Expect 2 UsageCredit records.
    //   - Verify properties for the first credit (amount 200, linked to usageMeter1).
    //   - Verify properties for the second credit (amount 300, linked to usageMeter2).
    // - Query the `ledgerEntries` table (filtered by testLedgerTransaction.id):
    //   - Expect 2 LedgerEntry records of type CreditGrantRecognized.
    //   - Verify each entry is correctly linked to its respective UsageCredit and LedgerAccount, with correct amounts.
  })

  it('should only process feature items with usageMeterIds', async () => {
    // setup:
    // - Create a featureItem (sifWithMeter) based on `baseSubscriptionItemFeature` with amount 50.
    // - Create another subscriptionItemFeature (sifWithoutMeter) by:
    //   - Creating a new Feature (featureWithoutMeter) of type Toggle (or any type not UsageCreditGrant, or a UsageCreditGrant feature with usageMeterId explicitly null if schema allows).
    //   - Creating a corresponding ProductFeature.
    //   - Creating the SubscriptionItemFeature, ensuring its `usageMeterId` is null or undefined.
    //   - It might be simpler to manually construct an object for the command payload that has `usageMeterId: null` and some `amount`.
    //     e.g., const itemWithoutMeter = { ...baseSubscriptionItemFeature, id: 'sif_no_meter', usageMeterId: null, amount: 150 }
    // - Update command.payload.subscriptionFeatureItems = [
    //     { ...baseSubscriptionItemFeature, amount: 50 },
    //     itemWithoutMeter
    //   ].
    // expects:
    // - Call grantEntitlementUsageCredits within an adminTransaction.
    // - Query the `usageCredits` table:
    //   - Expect 1 UsageCredit record (only for the item linked to usageMeter1).
    //   - Verify its amount is 50.
    // - Query the `ledgerEntries` table:
    //   - Expect 1 LedgerEntry record of type CreditGrantRecognized, linked to the created UsageCredit.
  })

  it('should handle cases with no feature items having usageMeterIds', async () => {
    // setup:
    // - Option A: command.payload.subscriptionFeatureItems = []
    // - Option B: Construct a feature item without a usageMeterId (similar to the above test, e.g., itemWithoutMeter) and set:
    //   command.payload.subscriptionFeatureItems = [itemWithoutMeter]
    // expects:
    // - Call grantEntitlementUsageCredits within an adminTransaction.
    // - Query the `usageCredits` table:
    //   - Expect 0 UsageCredit records to be created for this command.subscriptionId and newBillingPeriod.id.
    // - Query the `ledgerEntries` table (filtered by testLedgerTransaction.id):
    //   - Expect 0 LedgerEntry records of type CreditGrantRecognized.
  })

  it('should correctly propagate livemode: false to usage credits and ledger entries', async () => {
    // setup:
    // - IMPORTANT: This test requires careful setup of `livemode: false` for all relevant entities if not handled by `setupOrg` with a livemode param.
    //   Alternatively, update `command.livemode = false` directly before the call if the function primarily relies on this.
    //   The `grantEntitlementUsageCredits` function uses `command.livemode` for the new records.
    // - Set `command.livemode = false`.
    // - Update `command.payload.subscriptionFeatureItems = [{ ...baseSubscriptionItemFeature, amount: 75 }]`.
    //   (Note: baseSubscriptionItemFeature itself is created with livemode:true in beforeEach. The function uses command.livemode).
    // expects:
    // - Call grantEntitlementUsageCredits within an adminTransaction.
    // - Query the `usageCredits` table:
    //   - Expect 1 UsageCredit record.
    //   - Verify its `livemode` property is `false` and other properties are correct (amount 75, linked to usageMeter1).
    // - Query the `ledgerEntries` table:
    //   - Expect 1 LedgerEntry record of type CreditGrantRecognized.
    //   - Verify its `livemode` property is `false` and other properties are correct.
  })
})
