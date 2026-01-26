import { beforeEach, describe, expect, it } from 'bun:test'
import { TRPCError } from '@trpc/server'
import {
  setupBillingPeriod,
  setupCustomer,
  setupLedgerAccount,
  setupLedgerEntries,
  setupLedgerTransaction,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupSubscription,
  setupUsageCredit,
  setupUsageMeter,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import type { Customer } from '@/db/schema/customers'
import type { LedgerAccount } from '@/db/schema/ledgerAccounts'
import type { Organization } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import type { Subscription } from '@/db/schema/subscriptions'
import type { UsageMeter } from '@/db/schema/usageMeters'
import type { TRPCApiContext } from '@/server/trpcContext'
import {
  IntervalUnit,
  LedgerEntryType,
  LedgerTransactionType,
  PriceType,
  SubscriptionStatus,
  UsageCreditType,
} from '@/types'
import { customersRouter } from './customersRouter'

const createCaller = (
  organization: Organization.Record,
  apiKeyToken: string,
  livemode: boolean = true
) => {
  return customersRouter.createCaller({
    organizationId: organization.id,
    organization,
    apiKey: apiKeyToken,
    livemode,
    environment: livemode ? ('live' as const) : ('test' as const),
    isApi: true,
    path: '',
    user: null,
    session: null,
  } as TRPCApiContext)
}

describe('customers.getUsageBalances', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let apiKeyToken: string
  let subscription1: Subscription.Record
  let subscription2: Subscription.Record
  let usageMeter: UsageMeter.Record
  let price: Price.Record
  let pricingModelId: string

  beforeEach(async () => {
    // Setup organization with API key
    const orgSetup = await setupOrg()
    organization = orgSetup.organization
    pricingModelId = orgSetup.pricingModel.id

    const userApiKeySetup = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    if (!userApiKeySetup.apiKey.token) {
      throw new Error('API key token not found after setup')
    }
    apiKeyToken = userApiKeySetup.apiKey.token

    // Setup customer
    customer = await setupCustomer({
      organizationId: organization.id,
      email: `customer+${Date.now()}@test.com`,
      externalId: `ext-customer-${Date.now()}`,
    })

    // Setup usage meter
    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter',
      livemode: true,
      pricingModelId,
    })

    // Setup usage price for the usage meter
    price = await setupPrice({
      name: 'Test Usage Price',
      type: PriceType.Usage,
      unitPrice: 100,
      livemode: true,
      isDefault: false,
      usageMeterId: usageMeter.id,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
    })

    // Setup payment method
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode: true,
    })

    // Setup first subscription (active/current)
    subscription1 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: orgSetup.price.id,
      status: SubscriptionStatus.Active,
      livemode: true,
      paymentMethodId: paymentMethod.id,
    })

    // Setup second subscription (active/current)
    subscription2 = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: orgSetup.price.id,
      status: SubscriptionStatus.Active,
      livemode: true,
      paymentMethodId: paymentMethod.id,
    })
  })

  it('returns balances for current subscriptions', async () => {
    // Setup billing periods for subscriptions
    const billingPeriod1 = await setupBillingPeriod({
      subscriptionId: subscription1.id,
      startDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
      endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      livemode: true,
    })

    const billingPeriod2 = await setupBillingPeriod({
      subscriptionId: subscription2.id,
      startDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
      endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      livemode: true,
    })

    // Setup ledger accounts and entries for both subscriptions
    const ledgerAccount1 = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription1.id,
      usageMeterId: usageMeter.id,
      livemode: true,
    })

    const ledgerAccount2 = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription2.id,
      usageMeterId: usageMeter.id,
      livemode: true,
    })

    // Create actual usage credits for subscription1
    const usageCredit1 = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: subscription1.id,
      usageMeterId: usageMeter.id,
      creditType: UsageCreditType.Grant,
      issuedAmount: 100,
      billingPeriodId: billingPeriod1.id,
      livemode: true,
    })

    // Create actual usage credits for subscription2
    const usageCredit2 = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: subscription2.id,
      usageMeterId: usageMeter.id,
      creditType: UsageCreditType.Grant,
      issuedAmount: 200,
      billingPeriodId: billingPeriod2.id,
      livemode: true,
    })

    // Create credit entries (positive balance) for subscription1
    const ledgerTransaction1 = await setupLedgerTransaction({
      organizationId: organization.id,
      subscriptionId: subscription1.id,
      type: LedgerTransactionType.AdminCreditAdjusted,
    })

    await setupLedgerEntries({
      organizationId: organization.id,
      subscriptionId: subscription1.id,
      ledgerTransactionId: ledgerTransaction1.id,
      ledgerAccountId: ledgerAccount1.id,
      usageMeterId: usageMeter.id,
      entries: [
        {
          entryType: LedgerEntryType.CreditGrantRecognized,
          sourceUsageCreditId: usageCredit1.id,
          amount: 100,
        },
      ],
    })

    // Create credit entries (positive balance) for subscription2
    const ledgerTransaction2 = await setupLedgerTransaction({
      organizationId: organization.id,
      subscriptionId: subscription2.id,
      type: LedgerTransactionType.AdminCreditAdjusted,
    })

    await setupLedgerEntries({
      organizationId: organization.id,
      subscriptionId: subscription2.id,
      ledgerTransactionId: ledgerTransaction2.id,
      ledgerAccountId: ledgerAccount2.id,
      usageMeterId: usageMeter.id,
      entries: [
        {
          entryType: LedgerEntryType.CreditGrantRecognized,
          sourceUsageCreditId: usageCredit2.id,
          amount: 200,
        },
      ],
    })

    const caller = createCaller(organization, apiKeyToken)
    const result = await caller.getUsageBalances({
      externalId: customer.externalId!,
    })

    // Should return balances for both subscriptions
    expect(result.usageMeterBalances).toHaveLength(2)

    // Verify both subscriptions have balances returned
    const sub1Balance = result.usageMeterBalances.find(
      (b) => b.subscriptionId === subscription1.id
    )
    const sub2Balance = result.usageMeterBalances.find(
      (b) => b.subscriptionId === subscription2.id
    )

    expect(sub1Balance).toMatchObject({
      subscriptionId: subscription1.id,
      availableBalance: 100,
      id: usageMeter.id,
    })
    expect(sub2Balance).toMatchObject({
      subscriptionId: subscription2.id,
      availableBalance: 200,
      id: usageMeter.id,
    })
  })

  it('filters by subscriptionId', async () => {
    // Setup billing periods for subscriptions
    const billingPeriod1 = await setupBillingPeriod({
      subscriptionId: subscription1.id,
      startDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
      endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      livemode: true,
    })

    const billingPeriod2 = await setupBillingPeriod({
      subscriptionId: subscription2.id,
      startDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
      endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      livemode: true,
    })

    // Setup ledger accounts and entries for both subscriptions
    const ledgerAccount1 = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription1.id,
      usageMeterId: usageMeter.id,
      livemode: true,
    })

    const ledgerAccount2 = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription2.id,
      usageMeterId: usageMeter.id,
      livemode: true,
    })

    // Create actual usage credits for subscription1
    const usageCredit1 = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: subscription1.id,
      usageMeterId: usageMeter.id,
      creditType: UsageCreditType.Grant,
      issuedAmount: 100,
      billingPeriodId: billingPeriod1.id,
      livemode: true,
    })

    // Create actual usage credits for subscription2
    const usageCredit2 = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: subscription2.id,
      usageMeterId: usageMeter.id,
      creditType: UsageCreditType.Grant,
      issuedAmount: 200,
      billingPeriodId: billingPeriod2.id,
      livemode: true,
    })

    // Create credit entries for subscription1
    const ledgerTransaction1 = await setupLedgerTransaction({
      organizationId: organization.id,
      subscriptionId: subscription1.id,
      type: LedgerTransactionType.AdminCreditAdjusted,
    })

    await setupLedgerEntries({
      organizationId: organization.id,
      subscriptionId: subscription1.id,
      ledgerTransactionId: ledgerTransaction1.id,
      ledgerAccountId: ledgerAccount1.id,
      usageMeterId: usageMeter.id,
      entries: [
        {
          entryType: LedgerEntryType.CreditGrantRecognized,
          sourceUsageCreditId: usageCredit1.id,
          amount: 100,
        },
      ],
    })

    // Create credit entries for subscription2
    const ledgerTransaction2 = await setupLedgerTransaction({
      organizationId: organization.id,
      subscriptionId: subscription2.id,
      type: LedgerTransactionType.AdminCreditAdjusted,
    })

    await setupLedgerEntries({
      organizationId: organization.id,
      subscriptionId: subscription2.id,
      ledgerTransactionId: ledgerTransaction2.id,
      ledgerAccountId: ledgerAccount2.id,
      usageMeterId: usageMeter.id,
      entries: [
        {
          entryType: LedgerEntryType.CreditGrantRecognized,
          sourceUsageCreditId: usageCredit2.id,
          amount: 200,
        },
      ],
    })

    const caller = createCaller(organization, apiKeyToken)

    // Filter by subscription1
    const result = await caller.getUsageBalances({
      externalId: customer.externalId!,
      subscriptionId: subscription1.id,
    })

    // Should return balances only for subscription1
    expect(result.usageMeterBalances).toHaveLength(1)
    expect(result.usageMeterBalances[0].subscriptionId).toBe(
      subscription1.id
    )
    expect(result.usageMeterBalances[0].availableBalance).toBe(100)
  })

  it('rejects subscriptionId not owned by customer', async () => {
    // Setup another customer and subscription
    const otherCustomer = await setupCustomer({
      organizationId: organization.id,
      email: `other+${Date.now()}@test.com`,
      externalId: `ext-other-${Date.now()}`,
    })

    const otherPaymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: otherCustomer.id,
      livemode: true,
    })

    const orgSetup = await setupOrg()
    const otherSubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: otherCustomer.id,
      priceId: orgSetup.price.id,
      status: SubscriptionStatus.Active,
      livemode: true,
      paymentMethodId: otherPaymentMethod.id,
    })

    const caller = createCaller(organization, apiKeyToken)

    // Try to get balances for subscription that doesn't belong to the customer
    const error = await caller
      .getUsageBalances({
        externalId: customer.externalId!,
        subscriptionId: otherSubscription.id,
      })
      .catch((e) => e)

    expect(error).toBeInstanceOf(TRPCError)
    expect(error.code).toBe('NOT_FOUND')
    expect(error.message).toContain('not found for customer')
  })

  it('returns empty array when customer has no current subscriptions', async () => {
    // Create a new customer without subscriptions
    const newCustomer = await setupCustomer({
      organizationId: organization.id,
      email: `new+${Date.now()}@test.com`,
      externalId: `ext-new-${Date.now()}`,
    })

    const caller = createCaller(organization, apiKeyToken)
    const result = await caller.getUsageBalances({
      externalId: newCustomer.externalId!,
    })

    expect(result.usageMeterBalances).toHaveLength(0)
  })

  it('returns 404 for non-existent customer', async () => {
    const caller = createCaller(organization, apiKeyToken)

    const error = await caller
      .getUsageBalances({
        externalId: 'non-existent-customer',
      })
      .catch((e) => e)

    expect(error).toBeInstanceOf(TRPCError)
    expect(error.code).toBe('NOT_FOUND')
    expect(error.message).toContain('Customer with externalId')
  })

  it('excludes canceled subscriptions from default behavior', async () => {
    // Setup billing period for subscription1
    const billingPeriod1 = await setupBillingPeriod({
      subscriptionId: subscription1.id,
      startDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
      endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      livemode: true,
    })

    // Setup ledger account for subscription1 (active)
    const ledgerAccount1 = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription1.id,
      usageMeterId: usageMeter.id,
      livemode: true,
    })

    // Create actual usage credit for subscription1
    const usageCredit1 = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: subscription1.id,
      usageMeterId: usageMeter.id,
      creditType: UsageCreditType.Grant,
      issuedAmount: 100,
      billingPeriodId: billingPeriod1.id,
      livemode: true,
    })

    const ledgerTransaction1 = await setupLedgerTransaction({
      organizationId: organization.id,
      subscriptionId: subscription1.id,
      type: LedgerTransactionType.AdminCreditAdjusted,
    })

    await setupLedgerEntries({
      organizationId: organization.id,
      subscriptionId: subscription1.id,
      ledgerTransactionId: ledgerTransaction1.id,
      ledgerAccountId: ledgerAccount1.id,
      usageMeterId: usageMeter.id,
      entries: [
        {
          entryType: LedgerEntryType.CreditGrantRecognized,
          sourceUsageCreditId: usageCredit1.id,
          amount: 100,
        },
      ],
    })

    // Create a payment method for the canceled subscription customer
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode: true,
    })

    // Setup a canceled subscription for the same customer
    const orgSetup = await setupOrg()
    const canceledSubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: orgSetup.price.id,
      status: SubscriptionStatus.Canceled,
      livemode: true,
      paymentMethodId: paymentMethod.id,
      canceledAt: Date.now(),
    })

    // Setup billing period for canceled subscription
    const canceledBillingPeriod = await setupBillingPeriod({
      subscriptionId: canceledSubscription.id,
      startDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
      endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      livemode: true,
    })

    // Setup ledger account for canceled subscription
    const canceledLedgerAccount = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: canceledSubscription.id,
      usageMeterId: usageMeter.id,
      livemode: true,
    })

    // Create actual usage credit for canceled subscription
    const canceledUsageCredit = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: canceledSubscription.id,
      usageMeterId: usageMeter.id,
      creditType: UsageCreditType.Grant,
      issuedAmount: 500,
      billingPeriodId: canceledBillingPeriod.id,
      livemode: true,
    })

    const canceledLedgerTransaction = await setupLedgerTransaction({
      organizationId: organization.id,
      subscriptionId: canceledSubscription.id,
      type: LedgerTransactionType.AdminCreditAdjusted,
    })

    await setupLedgerEntries({
      organizationId: organization.id,
      subscriptionId: canceledSubscription.id,
      ledgerTransactionId: canceledLedgerTransaction.id,
      ledgerAccountId: canceledLedgerAccount.id,
      usageMeterId: usageMeter.id,
      entries: [
        {
          entryType: LedgerEntryType.CreditGrantRecognized,
          sourceUsageCreditId: canceledUsageCredit.id,
          amount: 500,
        },
      ],
    })

    const caller = createCaller(organization, apiKeyToken)
    const result = await caller.getUsageBalances({
      externalId: customer.externalId!,
    })

    // Should not include the canceled subscription's balances
    // Only subscription1 and subscription2 are active
    const canceledBalance = result.usageMeterBalances.find(
      (b) => b.subscriptionId === canceledSubscription.id
    )
    expect(canceledBalance).toBeUndefined()

    // Should still include active subscriptions
    const sub1Balance = result.usageMeterBalances.find(
      (b) => b.subscriptionId === subscription1.id
    )
    expect(sub1Balance).toMatchObject({
      subscriptionId: subscription1.id,
      id: usageMeter.id,
    })
  })

  it('returns balances for explicitly requested canceled subscription', async () => {
    // Create a payment method for the canceled subscription customer
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode: true,
    })

    // Setup a canceled subscription for the same customer
    const orgSetup = await setupOrg()
    const canceledSubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: orgSetup.price.id,
      status: SubscriptionStatus.Canceled,
      livemode: true,
      paymentMethodId: paymentMethod.id,
      canceledAt: Date.now(),
    })

    // Setup billing period for canceled subscription
    const canceledBillingPeriod = await setupBillingPeriod({
      subscriptionId: canceledSubscription.id,
      startDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
      endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      livemode: true,
    })

    // Setup ledger account for canceled subscription
    const canceledLedgerAccount = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: canceledSubscription.id,
      usageMeterId: usageMeter.id,
      livemode: true,
    })

    // Create actual usage credit for canceled subscription
    const canceledUsageCredit = await setupUsageCredit({
      organizationId: organization.id,
      subscriptionId: canceledSubscription.id,
      usageMeterId: usageMeter.id,
      creditType: UsageCreditType.Grant,
      issuedAmount: 500,
      billingPeriodId: canceledBillingPeriod.id,
      livemode: true,
    })

    const canceledLedgerTransaction = await setupLedgerTransaction({
      organizationId: organization.id,
      subscriptionId: canceledSubscription.id,
      type: LedgerTransactionType.AdminCreditAdjusted,
    })

    await setupLedgerEntries({
      organizationId: organization.id,
      subscriptionId: canceledSubscription.id,
      ledgerTransactionId: canceledLedgerTransaction.id,
      ledgerAccountId: canceledLedgerAccount.id,
      usageMeterId: usageMeter.id,
      entries: [
        {
          entryType: LedgerEntryType.CreditGrantRecognized,
          sourceUsageCreditId: canceledUsageCredit.id,
          amount: 500,
        },
      ],
    })

    const caller = createCaller(organization, apiKeyToken)

    // Explicitly request the canceled subscription by ID
    const result = await caller.getUsageBalances({
      externalId: customer.externalId!,
      subscriptionId: canceledSubscription.id,
    })

    // Should return balances for the explicitly requested canceled subscription
    expect(result.usageMeterBalances).toHaveLength(1)
    expect(result.usageMeterBalances[0]).toMatchObject({
      subscriptionId: canceledSubscription.id,
      availableBalance: 500,
      id: usageMeter.id,
    })
  })
})
