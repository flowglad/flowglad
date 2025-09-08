import * as R from 'ramda'
import db from '@/db/client'
import { adminTransaction } from '@/db/adminTransaction'
import { countries } from '@/db/schema/countries'
import { insertCustomer } from '@/db/tableMethods/customerMethods'
import { insertOrganization } from '@/db/tableMethods/organizationMethods'
import {
  insertProduct,
  selectProductById,
} from '@/db/tableMethods/productMethods'
import {
  insertSubscription,
  selectSubscriptionById,
} from '@/db/tableMethods/subscriptionMethods'
import {
  insertPrice,
  selectPriceById,
} from '@/db/tableMethods/priceMethods'
import { users } from '@/db/schema/users'
import { ApiKey, apiKeys } from '@/db/schema/apiKeys'
import { insertBillingPeriod } from '@/db/tableMethods/billingPeriodMethods'
import { insertBillingRun } from '@/db/tableMethods/billingRunMethods'
import { insertBillingPeriodItem } from '@/db/tableMethods/billingPeriodItemMethods'
import { insertInvoice } from '@/db/tableMethods/invoiceMethods'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'
import { invoicesInsertSchema } from '@/db/schema/invoices'
import { nanoid, z } from 'zod'
import {
  PriceType,
  IntervalUnit,
  PaymentMethodType,
  SubscriptionStatus,
  BillingPeriodStatus,
  BillingRunStatus,
  InvoiceStatus,
  InvoiceType,
  PaymentStatus,
  CurrencyCode,
  CountryCode,
  CheckoutSessionStatus,
  CheckoutSessionType,
  PurchaseStatus,
  FlowgladApiKeyType,
  DiscountAmountType,
  DiscountDuration,
  FeeCalculationType,
  FeatureUsageGrantFrequency,
  FeatureType,
  LedgerEntryStatus,
  LedgerEntryDirection,
  LedgerEntryType,
  LedgerTransactionType,
  UsageCreditStatus,
  UsageCreditSourceReferenceType,
  RefundStatus,
  UsageCreditApplicationStatus,
  SubscriptionItemType,
  StripeConnectContractType,
  BusinessOnboardingStatus,
} from '@/types'
import { core, isNil } from '@/utils/core'
import { sql } from 'drizzle-orm'
import { selectCountries } from '@/db/tableMethods/countryMethods'
import { insertPayment } from '@/db/tableMethods/paymentMethods'
import { BillingRun } from '@/db/schema/billingRuns'
import { insertUser } from '@/db/tableMethods/userMethods'
import { insertMembership } from '@/db/tableMethods/membershipMethods'
import { insertSubscriptionItem } from '@/db/tableMethods/subscriptionItemMethods'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { insertPurchase } from '@/db/tableMethods/purchaseMethods'
import { nulledPriceColumns, Price } from '@/db/schema/prices'
import { Purchase } from '@/db/schema/purchases'
import { projectPriceFieldsOntoPurchaseFields } from '@/utils/purchaseHelpers'
import { insertInvoiceLineItem } from '@/db/tableMethods/invoiceLineItemMethods'
import { Payment } from '@/db/schema/payments'
import { safelyInsertPaymentMethod } from '@/db/tableMethods/paymentMethodMethods'
import {
  selectPricingModelById,
  insertPricingModel,
  selectDefaultPricingModel,
} from '@/db/tableMethods/pricingModelMethods'
import { insertCheckoutSession } from '@/db/tableMethods/checkoutSessionMethods'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import { BillingAddress } from '@/db/schema/organizations'
import { insertDiscount } from '@/db/tableMethods/discountMethods'
import { insertFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { insertUsageMeter } from '@/db/tableMethods/usageMeterMethods'
import { insertProductFeature } from '@/db/tableMethods/productFeatureMethods'
import { memberships } from '@/db/schema/memberships'
import { insertLedgerAccount } from '@/db/tableMethods/ledgerAccountMethods'
import { Feature } from '@/db/schema/features'
import { ProductFeature } from '@/db/schema/productFeatures'
import { UsageEvent, usageEvents } from '@/db/schema/usageEvents'
import {
  LedgerTransaction,
  ledgerTransactions,
} from '@/db/schema/ledgerTransactions'
import {
  ledgerEntries,
  LedgerEntry,
  ledgerEntryNulledSourceIdColumns,
} from '@/db/schema/ledgerEntries'
import { UsageCredit, usageCredits } from '@/db/schema/usageCredits'
import {
  UsageCreditApplication,
  usageCreditApplications,
} from '@/db/schema/usageCreditApplications'
import { usageCreditBalanceAdjustments } from '@/db/schema/usageCreditBalanceAdjustments'
import { Refund, refunds } from '@/db/schema/refunds'
import { subscriptionMeterPeriodCalculations } from '@/db/schema/subscriptionMeterPeriodCalculations'
import { insertLedgerTransaction } from '@/db/tableMethods/ledgerTransactionMethods'
import {
  bulkInsertLedgerEntries,
  insertLedgerEntry,
} from '@/db/tableMethods/ledgerEntryMethods'
import { insertUsageCredit } from '@/db/tableMethods/usageCreditMethods'
import { insertUsageEvent } from '@/db/tableMethods/usageEventMethods'
import { insertUsageCreditApplication } from '@/db/tableMethods/usageCreditApplicationMethods'
import { insertRefund } from '@/db/tableMethods/refundMethods'
import { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import { insertSubscriptionItemFeature } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { insertFeature } from '@/db/tableMethods/featureMethods'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { Subscription } from '@/db/schema/subscriptions'
import { snakeCase } from 'change-case'
import { insertDiscountRedemption } from '@/db/tableMethods/discountRedemptionMethods'
import { DiscountRedemption } from '@/db/schema/discountRedemptions'
import { Discount } from '@/db/schema/discounts'

if (process.env.VERCEL_ENV === 'production') {
  throw new Error(
    'attempted to access seedDatabase.ts in production. This should never happen.'
  )
}

const insertCountries = async () => {
  await db
    .insert(countries)
    .values([
      {
        id: core.nanoid(),
        name: 'United States',
        code: CountryCode.US,
      },
    ])
    .onConflictDoNothing()
}

export const seedDatabase = async () => {
  //   await migrateDb()
  await insertCountries()
}

export const dropDatabase = async () => {
  console.log('drop database....')
  await db.delete(countries)
}

export const setupOrg = async (params?: {
  monthlyBillingVolumeFreeTier?: number
  feePercentage?: string
}) => {
  await insertCountries()
  return adminTransaction(async ({ transaction }) => {
    const [country] = await selectCountries({}, transaction)
    const organization = await insertOrganization(
      {
        name: `Flowglad Test ${core.nanoid()}`,
        countryId: country.id,
        defaultCurrency: CurrencyCode.USD,
        monthlyBillingVolumeFreeTier:
          params?.monthlyBillingVolumeFreeTier ?? undefined,
        feePercentage: params?.feePercentage ?? undefined,
        onboardingStatus: BusinessOnboardingStatus.FullyOnboarded,
        stripeConnectContractType: StripeConnectContractType.Platform,
        featureFlags: {},
        contactEmail: 'test@test.com',
        billingAddress: {
          address: {
            line1: '123 Test St',
            line2: 'Apt 1',
            city: 'Test City',
            state: 'Test State',
            postal_code: '12345',
            country: 'US',
          },
        },
      },
      transaction
    )
    const pricingModel = await insertPricingModel(
      {
        name: 'Flowglad Test Pricing Model',
        organizationId: organization.id,
        livemode: true,
        isDefault: true,
      },
      transaction
    )

    const product = await insertProduct(
      {
        name: 'Flowglad Test Product',
        organizationId: organization.id,
        livemode: true,
        description: 'Flowglad Live Product',
        imageURL: 'https://flowglad.com/logo.png',
        active: true,
        displayFeatures: [],
        singularQuantityLabel: 'seat',
        pluralQuantityLabel: 'seats',
        pricingModelId: pricingModel.id,
        externalId: null,
        default: false,
        slug: `flowglad-test-product-price+${core.nanoid()}`,
      },
      transaction
    )

    const price = (await insertPrice(
      {
        ...nulledPriceColumns,
        productId: product.id,
        name: 'Flowglad Test Product Price',
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        active: true,
        isDefault: true,
        unitPrice: 1000,
        setupFeeAmount: 0,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
        externalId: null,
        slug: `flowglad-test-product-price+${core.nanoid()}`,
      },
      transaction
    )) as Price.SubscriptionRecord
    return { organization, product, price, pricingModel }
  })
}

export const setupProduct = async ({
  organizationId,
  name,
  livemode,
  pricingModelId,
  active = true,
  default: isDefault = false,
}: {
  organizationId: string
  name: string
  livemode?: boolean
  pricingModelId: string
  active?: boolean
  default?: boolean
}) => {
  return adminTransaction(async ({ transaction }) => {
    return await insertProduct(
      {
        name,
        organizationId,
        livemode: typeof livemode === 'boolean' ? livemode : true,
        description: 'Flowglad Live Product',
        imageURL: 'https://flowglad.com/logo.png',
        active,
        displayFeatures: [],
        singularQuantityLabel: 'seat',
        pluralQuantityLabel: 'seats',
        pricingModelId,
        externalId: null,
        default: isDefault,
        slug: `flowglad-test-product-price+${core.nanoid()}`,
      },
      transaction
    )
  })
}

export const setupPaymentMethod = async (params: {
  organizationId: string
  customerId: string
  livemode?: boolean
  paymentMethodData?: Record<string, any>
  default?: boolean
  stripePaymentMethodId?: string
  type?: PaymentMethodType
}) => {
  return adminTransaction(async ({ transaction }) => {
    return safelyInsertPaymentMethod(
      {
        customerId: params.customerId,
        type: params.type ?? PaymentMethodType.Card,
        livemode: params.livemode ?? true,
        default: true,
        externalId: null,
        billingDetails: {
          name: 'Test',
          email: 'test@test.com',
          address: {
            line1: '123 Test St',
            line2: 'Apt 1',
            country: 'US',
            city: 'Test City',
            state: 'Test State',
            postal_code: '12345',
          },
        },
        paymentMethodData: params.paymentMethodData ?? {},
        metadata: {},
        stripePaymentMethodId:
          params.stripePaymentMethodId ?? `pm_${core.nanoid()}`,
      },
      transaction
    )
  })
}

interface SetupCustomerParams {
  organizationId: string
  stripeCustomerId?: string
  invoiceNumberBase?: string
  email?: string
  livemode?: boolean
  externalId?: string
  userId?: string
}

export const setupCustomer = async (params: SetupCustomerParams) => {
  return adminTransaction(async ({ transaction }) => {
    const email = params.email ?? `test+${core.nanoid()}@test.com`
    return insertCustomer(
      {
        organizationId: params.organizationId,
        email,
        name: email,
        externalId: params.externalId?.trim() || core.nanoid(),
        livemode: params.livemode ?? true,
        stripeCustomerId:
          params.stripeCustomerId ?? `cus_${core.nanoid()}`,
        invoiceNumberBase: params.invoiceNumberBase ?? core.nanoid(),
        userId: params.userId,
      },
      transaction
    )
  })
}

type SetupUserAndCustomerParams = Omit<
  SetupCustomerParams,
  'userId'
> & {
  betterAuthUserId?: string
}

export const setupUserAndCustomer = async (
  params: SetupUserAndCustomerParams
) => {
  const userId = core.nanoid()
  const user = await adminTransaction(async ({ transaction }) => {
    return await insertUser(
      {
        email: `test+${userId}@test.com`,
        name: `Test ${userId}`,
        betterAuthId: params.betterAuthUserId,
        id: userId,
      },
      transaction
    )
  })
  const customer = await setupCustomer({
    ...params,
    userId,
  })
  return {
    user,
    customer,
  }
}

export const teardownOrg = async ({
  organizationId,
}: {
  organizationId: string
}) => {
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error(
      'attempted to access teardownOrg in production. This should never happen.'
    )
  }
  await sql`DELETE FROM "BillingPeriodItems" WHERE billingPeriodId IN (SELECT id FROM "BillingPeriods" WHERE subscriptionId IN (SELECT id FROM "Subscriptions" WHERE organizationId = ${organizationId}))`
  await sql`DELETE FROM "BillingRuns" WHERE billingPeriodId IN (SELECT id FROM "BillingPeriods" WHERE subscriptionId IN (SELECT id FROM "Subscriptions" WHERE organizationId = ${organizationId}))`
  await sql`DELETE FROM "Invoices" WHERE billingPeriodId IN (SELECT id FROM "BillingPeriods" WHERE subscriptionId IN (SELECT id FROM "Subscriptions" WHERE organizationId = ${organizationId}))`
  await sql`DELETE FROM "SubscriptionItems" WHERE subscriptionId IN (SELECT id FROM "Subscriptions" WHERE organizationId = ${organizationId})`
  await sql`DELETE FROM "BillingPeriods" WHERE subscriptionId IN (SELECT id FROM "Subscriptions" WHERE organizationId = ${organizationId})`
  await sql`DELETE FROM "Subscriptions" WHERE organizationId = ${organizationId}`
  await sql`DELETE FROM "Customers" WHERE organizationId = ${organizationId}`
  await sql`DELETE FROM "Prices" WHERE organizationId = ${organizationId}`
  await sql`DELETE FROM "Products" WHERE organizationId = ${organizationId}`
  await sql`DELETE FROM "Organizations" WHERE id = ${organizationId} CASCADE`
}

export const setupSubscription = async (params: {
  organizationId: string
  customerId: string
  paymentMethodId?: string
  defaultPaymentMethodId?: string
  priceId: string
  interval?: IntervalUnit
  intervalCount?: number
  livemode?: boolean
  currentBillingPeriodEnd?: Date
  currentBillingPeriodStart?: Date
  status?: SubscriptionStatus
  trialEnd?: Date
  renews?: boolean
  startDate?: Date
  cancelScheduledAt?: Date
  isFreePlan?: boolean
  cancellationReason?: string | null
  replacedBySubscriptionId?: string | null
  canceledAt?: Date | null
  metadata?: any
  billingCycleAnchorDate?: Date
}): Promise<Subscription.Record> => {
  const status = params.status ?? SubscriptionStatus.Active
  return adminTransaction(async ({ transaction }) => {
    const price = await selectPriceById(params.priceId, transaction)
    if (params.renews === false) {
      return (await insertSubscription(
        {
          organizationId: params.organizationId,
          customerId: params.customerId,
          defaultPaymentMethodId:
            params.defaultPaymentMethodId ??
            params.paymentMethodId ??
            null,
          status: status as
            | SubscriptionStatus.CreditTrial
            | SubscriptionStatus.Active
            | SubscriptionStatus.Canceled,
          livemode: params.livemode ?? true,
          billingCycleAnchorDate: null,
          currentBillingPeriodStart: null,
          currentBillingPeriodEnd: null,
          canceledAt: params.canceledAt ?? null,
          cancelScheduledAt: params.cancelScheduledAt ?? null,
          trialEnd: null,
          backupPaymentMethodId: null,
          priceId: params.priceId,
          interval: null,
          intervalCount: null,
          metadata: params.metadata ?? {},
          stripeSetupIntentId: `setupintent_${core.nanoid()}`,
          name: null,
          runBillingAtPeriodStart:
            price.type === PriceType.Subscription ? true : false,
          externalId: null,
          startDate: new Date(),
          renews: false,
          isFreePlan: params.isFreePlan ?? false,
          cancellationReason: params.cancellationReason ?? null,
          replacedBySubscriptionId:
            params.replacedBySubscriptionId ?? null,
        } as Subscription.NonRenewingInsert,
        transaction
      )) as Subscription.NonRenewingRecord
    } else {
      return (await insertSubscription(
        {
          organizationId: params.organizationId,
          customerId: params.customerId,
          defaultPaymentMethodId:
            params.defaultPaymentMethodId ??
            params.paymentMethodId ??
            null,
          status: status as
            | SubscriptionStatus.Trialing
            | SubscriptionStatus.Active
            | SubscriptionStatus.PastDue
            | SubscriptionStatus.Unpaid
            | SubscriptionStatus.CancellationScheduled
            | SubscriptionStatus.Incomplete
            | SubscriptionStatus.IncompleteExpired
            | SubscriptionStatus.Canceled
            | SubscriptionStatus.Paused,
          livemode: params.livemode ?? true,
          billingCycleAnchorDate:
            params.billingCycleAnchorDate ?? new Date(),
          currentBillingPeriodEnd:
            params.currentBillingPeriodEnd ??
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          currentBillingPeriodStart:
            params.currentBillingPeriodStart ?? new Date(),
          canceledAt: params.canceledAt ?? null,
          cancelScheduledAt: params.cancelScheduledAt ?? null,
          trialEnd: params.trialEnd ?? null,
          backupPaymentMethodId: null,
          priceId: params.priceId,
          interval: params.interval ?? IntervalUnit.Month,
          intervalCount: params.intervalCount ?? 1,
          metadata: params.metadata ?? {},
          stripeSetupIntentId: `setupintent_${core.nanoid()}`,
          name: null,
          runBillingAtPeriodStart:
            price.type === PriceType.Subscription ? true : false,
          externalId: null,
          startDate: params.startDate ?? new Date(),
          renews: isNil(params.renews) ? true : params.renews,
          isFreePlan: params.isFreePlan ?? false,
          cancellationReason: params.cancellationReason ?? null,
          replacedBySubscriptionId:
            params.replacedBySubscriptionId ?? null,
        },
        transaction
      )) as Subscription.StandardRecord
    }
  })
}

export const setupBillingPeriod = async ({
  subscriptionId,
  startDate,
  endDate,
  status = BillingPeriodStatus.Active,
  livemode = true,
}: {
  subscriptionId: string
  startDate: Date
  endDate: Date
  status?: BillingPeriodStatus
  livemode?: boolean
}) => {
  return adminTransaction(async ({ transaction }) => {
    return insertBillingPeriod(
      {
        subscriptionId,
        startDate,
        endDate,
        status,
        livemode,
      },
      transaction
    )
  })
}

export const setupBillingRun = async ({
  billingPeriodId,
  paymentMethodId,
  status = BillingRunStatus.Scheduled,
  scheduledFor = new Date(),
  subscriptionId,
  livemode = true,
  stripePaymentIntentId,
  lastPaymentIntentEventTimestamp,
}: Partial<BillingRun.Insert> & {
  billingPeriodId: string
  paymentMethodId: string
  subscriptionId: string
}) => {
  return adminTransaction(async ({ transaction }) => {
    return insertBillingRun(
      {
        billingPeriodId,
        paymentMethodId,
        status,
        scheduledFor,
        livemode,
        subscriptionId,
        stripePaymentIntentId,
        lastPaymentIntentEventTimestamp,
      },
      transaction
    )
  })
}

export const setupBillingPeriodItem = async ({
  billingPeriodId,
  quantity,
  unitPrice,
  name = 'Test Item',
  description = 'Test Description',
  type = SubscriptionItemType.Static,
  livemode = true,
  usageMeterId,
  discountRedemptionId,
  usageEventsPerUnit,
}: {
  billingPeriodId: string
  quantity: number
  unitPrice: number
  name?: string
  description?: string
  livemode?: boolean
  type?: SubscriptionItemType
  usageMeterId?: string
  discountRedemptionId?: string
  usageEventsPerUnit?: number
}) => {
  return adminTransaction(async ({ transaction }) => {
    if (type === SubscriptionItemType.Usage) {
      if (!usageMeterId) {
        throw new Error('Usage meter ID is required for usage items')
      }
      if (usageEventsPerUnit === undefined) {
        throw new Error(
          'Usage events per unit is required for usage items'
        )
      }
      if (discountRedemptionId) {
        throw new Error(
          'Discount redemption ID is not allowed for usage items'
        )
      }
      const insert: BillingPeriodItem.Insert = {
        billingPeriodId,
        quantity,
        unitPrice,
        name,
        description,
        type,
        usageMeterId,
        usageEventsPerUnit,
        discountRedemptionId: null,
        livemode,
      }
      return insertBillingPeriodItem(insert, transaction)
    } else {
      if (usageMeterId) {
        throw new Error(
          'Usage meter ID is not allowed for static items'
        )
      }
      if (usageEventsPerUnit) {
        throw new Error(
          'Usage events per unit is not allowed for static items'
        )
      }
      if (discountRedemptionId) {
        throw new Error(
          'Discount redemption ID is not allowed for static items'
        )
      }
      const insert: BillingPeriodItem.Insert = {
        billingPeriodId,
        quantity,
        unitPrice,
        name,
        description,
        type,
        livemode,
        usageMeterId: null,
        discountRedemptionId: null,
        usageEventsPerUnit: null,
      }
      return insertBillingPeriodItem(insert, transaction)
    }
  })
}

export const setupPurchase = async ({
  customerId,
  organizationId,
  livemode,
  priceId,
  status = PurchaseStatus.Open,
}: {
  customerId: string
  organizationId: string
  livemode?: boolean
  priceId: string
  status?: PurchaseStatus
}) => {
  return adminTransaction(async ({ transaction }) => {
    const price = await selectPriceById(priceId, transaction)
    const purchaseFields = projectPriceFieldsOntoPurchaseFields(price)
    const coreFields = {
      customerId,
      organizationId,
      livemode: livemode ?? price.livemode,
      name: 'Test Purchase',
      priceId: price.id,
      priceType: price.type,
      totalPurchaseValue: price.unitPrice,
      quantity: 1,
      firstInvoiceValue: price.unitPrice,
      status,
    } as const
    if (price.type === PriceType.Usage) {
      return await insertPurchase(
        {
          ...coreFields,
          trialPeriodDays: null,
          pricePerBillingCycle: null,
          intervalUnit: null,
          intervalCount: null,
        } as Purchase.Insert,
        transaction
      )
    } else if (price.type === PriceType.Subscription) {
      return await insertPurchase(
        {
          ...coreFields,
          ...purchaseFields,
        } as Purchase.Insert,
        transaction
      )
    } else if (price.type === PriceType.SinglePayment) {
      return await insertPurchase(
        {
          ...coreFields,
          ...purchaseFields,
        } as Purchase.Insert,
        transaction
      )
    }
    return await insertPurchase(
      {
        ...coreFields,
        ...purchaseFields,
      } as Purchase.Insert,
      transaction
    )
  })
}

export const setupInvoice = async ({
  billingPeriodId,
  customerId,
  organizationId,
  status = InvoiceStatus.Draft,
  livemode = true,
  priceId,
  purchaseId: existingPurchaseId,
  billingRunId,
}: {
  billingPeriodId?: string
  customerId: string
  organizationId: string
  status?: InvoiceStatus
  livemode?: boolean
  type?: InvoiceType
  priceId: string
  purchaseId?: string
  billingRunId?: string
}) => {
  return adminTransaction(async ({ transaction }) => {
    let billingPeriod: BillingPeriod.Record | null = null
    let purchaseIdToUse: string | null = existingPurchaseId ?? null

    if (billingPeriodId) {
      billingPeriod = await selectBillingPeriodById(
        billingPeriodId,
        transaction
      )
      if (purchaseIdToUse && billingPeriod) {
        throw new Error(
          'Invoice cannot be for both a billingPeriodId and an existing purchaseId.'
        )
      }
    } else if (!purchaseIdToUse) {
      const newInternalPurchase = await setupPurchase({
        customerId,
        organizationId,
        livemode,
        priceId,
      })
      purchaseIdToUse = newInternalPurchase.id
    }

    const invoice = await insertInvoice(
      {
        billingPeriodId: billingPeriod?.id ?? null,
        customerId,
        organizationId,
        status,
        livemode,
        invoiceNumber: `TEST-001-${core.nanoid()}`,
        invoiceDate: new Date(),
        dueDate: new Date(),
        billingPeriodStartDate: billingPeriod?.startDate ?? null,
        billingPeriodEndDate: billingPeriod?.endDate ?? null,
        type: billingPeriod
          ? InvoiceType.Subscription
          : InvoiceType.Purchase,
        purchaseId: purchaseIdToUse,
        currency: CurrencyCode.USD,
        taxCountry: CountryCode.US,
        subscriptionId: billingPeriod?.subscriptionId ?? null,
        billingRunId,
      } as z.infer<typeof invoicesInsertSchema>,
      transaction
    )
    await insertInvoiceLineItem(
      {
        invoiceId: invoice.id,
        description: 'Test Description',
        price: 1000,
        quantity: 1,
        livemode: invoice.livemode,
        type: SubscriptionItemType.Static,
        priceId,
        billingRunId: null,
        ledgerAccountId: null,
        ledgerAccountCredit: null,
      },
      transaction
    )
    return invoice
  })
}

export const setupPrice = async ({
  productId,
  name,
  type,
  unitPrice,
  intervalUnit,
  intervalCount,
  livemode,
  isDefault,
  setupFeeAmount,
  trialPeriodDays,
  currency,
  externalId,
  active = true,
  usageMeterId,
  startsWithCreditTrial,
  slug,
}: {
  productId: string
  name: string
  type: PriceType
  unitPrice: number
  intervalUnit: IntervalUnit
  intervalCount: number
  livemode: boolean
  isDefault: boolean
  setupFeeAmount?: number
  usageMeterId?: string
  currency?: CurrencyCode
  externalId?: string
  trialPeriodDays?: number
  active?: boolean
  startsWithCreditTrial?: boolean
  slug?: string
}): Promise<Price.Record> => {
  return adminTransaction(async ({ transaction }) => {
    const basePrice = {
      ...nulledPriceColumns,
      productId,
      type,
      unitPrice,
      livemode,
      isDefault,
      active,
      currency: currency ?? CurrencyCode.USD,
      externalId: externalId ?? core.nanoid(),
      slug: slug ?? `flowglad-test-product-price+${core.nanoid()}`,
    }

    const priceConfig = {
      [PriceType.SinglePayment]: {
        name: `${name} (Single Payment)`,
        ...nulledPriceColumns,
      },
      [PriceType.Usage]: {
        name,
        intervalUnit,
        intervalCount,
        setupFeeAmount: null,
        trialPeriodDays: null,
        usageMeterId,
        usageEventsPerUnit: 1,
      },
      [PriceType.Subscription]: {
        name,
        intervalUnit,
        intervalCount,
        setupFeeAmount: setupFeeAmount ?? 0,
        trialPeriodDays: trialPeriodDays ?? null,
        usageEventsPerUnit: null,
        startsWithCreditTrial: startsWithCreditTrial ?? false,
      },
    }
    if (type === PriceType.Usage && !usageMeterId) {
      throw new Error('Usage price must have a usage meter')
    }
    switch (type) {
      case PriceType.SinglePayment:
        return insertPrice(
          {
            ...basePrice,
            ...priceConfig[PriceType.SinglePayment],
            type: PriceType.SinglePayment,
          },
          transaction
        )
      case PriceType.Subscription:
        return insertPrice(
          {
            ...basePrice,
            ...priceConfig[PriceType.Subscription],
            type: PriceType.Subscription,
          },
          transaction
        )
      case PriceType.Usage:
        return insertPrice(
          {
            ...basePrice,
            ...priceConfig[PriceType.Usage],
            usageMeterId: usageMeterId!,
            type: PriceType.Usage,
          },
          transaction
        )
      default:
        throw new Error(`Invalid price type: ${type}`)
    }
  })
}

export const setupPayment = async ({
  stripeChargeId,
  status,
  amount,
  livemode = true,
  customerId,
  organizationId,
  stripePaymentIntentId,
  invoiceId,
  paymentMethod,
  billingPeriodId,
  subscriptionId,
  refunded = false,
  refundedAmount = 0,
  refundedAt,
  chargeDate,
  purchaseId,
  paymentMethodId,
}: {
  stripeChargeId: string
  status: PaymentStatus
  amount: number
  livemode?: boolean
  customerId: string
  organizationId: string
  stripePaymentIntentId?: string
  paymentMethod?: PaymentMethodType
  invoiceId: string
  billingPeriodId?: string
  subscriptionId?: string
  refunded?: boolean
  refundedAmount?: number
  refundedAt?: Date
  chargeDate?: Date
  purchaseId?: string
  paymentMethodId?: string
}): Promise<Payment.Record> => {
  return adminTransaction(async ({ transaction }) => {
    const payment = await insertPayment(
      {
        stripeChargeId,
        status,
        amount,
        livemode,
        customerId,
        organizationId,
        stripePaymentIntentId: stripePaymentIntentId ?? core.nanoid(),
        invoiceId,
        billingPeriodId,
        currency: CurrencyCode.USD,
        paymentMethod: paymentMethod ?? PaymentMethodType.Card,
        chargeDate: chargeDate ?? new Date(),
        taxCountry: CountryCode.US,
        subscriptionId: subscriptionId ?? null,
        purchaseId: purchaseId ?? null,
        refunded,
        refundedAmount,
        refundedAt,
        paymentMethodId,
      },
      transaction
    )
    return payment
  })
}

export const setupMemberships = async ({
  organizationId,
}: {
  organizationId: string
}) => {
  return adminTransaction(async ({ transaction }) => {
    const nanoid = core.nanoid()
    const user = await insertUser(
      {
        email: `test+${nanoid}@test.com`,
        name: `Test ${nanoid}`,
        id: core.nanoid(),
      },
      transaction
    )
    return insertMembership(
      {
        organizationId,
        userId: user.id,
        focused: true,
        livemode: true,
      },
      transaction
    )
  })
}

export const setupSubscriptionItem = async ({
  subscriptionId,
  name,
  quantity,
  unitPrice,
  priceId,
  addedDate,
  metadata,
  type = SubscriptionItemType.Static,
  usageMeterId,
  usageEventsPerUnit,
}: {
  subscriptionId: string
  name: string
  quantity: number
  unitPrice: number
  priceId?: string
  addedDate?: Date
  removedDate?: Date
  metadata?: Record<string, any>
  type?: SubscriptionItemType
  usageMeterId?: string
  usageEventsPerUnit?: number
}) => {
  return adminTransaction(async ({ transaction }) => {
    const subscription = await selectSubscriptionById(
      subscriptionId,
      transaction
    )
    if (!subscription) {
      throw new Error('Subscription not found')
    }
    if (type === SubscriptionItemType.Usage) {
      if (!usageMeterId) {
        throw new Error('Usage meter ID is required for usage items')
      }
      if (usageEventsPerUnit === undefined) {
        throw new Error(
          'Usage events per unit is required for usage items'
        )
      }
      if (priceId) {
        throw new Error('Price ID is not allowed for usage items')
      }
      const insert: SubscriptionItem.UsageInsert = {
        subscriptionId: subscription.id,
        name,
        quantity,
        unitPrice,
        livemode: subscription.livemode,
        priceId: priceId ?? subscription.priceId!,
        addedDate: addedDate ?? new Date(),
        expiredAt: null,
        metadata: metadata ?? {},
        externalId: null,
        type,
        usageMeterId,
        usageEventsPerUnit,
      }
      return insertSubscriptionItem(insert, transaction)
    } else {
      if (usageMeterId) {
        throw new Error(
          'Usage meter ID is not allowed for static items'
        )
      }
      if (usageEventsPerUnit) {
        throw new Error(
          'Usage events per unit is not allowed for static items'
        )
      }
      const insert: SubscriptionItem.StaticInsert = {
        subscriptionId: subscription.id,
        name,
        quantity,
        unitPrice,
        livemode: subscription.livemode,
        priceId: priceId ?? subscription.priceId!,
        addedDate: addedDate ?? new Date(),
        expiredAt: null,
        metadata: metadata ?? {},
        externalId: null,
        type,
        usageMeterId: null,
        usageEventsPerUnit: null,
      }
      return insertSubscriptionItem(insert, transaction)
    }
  })
}

export const setupPricingModel = async ({
  organizationId,
  name = 'Test Pricing Model',
  livemode = true,
  isDefault = false,
}: {
  organizationId: string
  name?: string
  livemode?: boolean
  isDefault?: boolean
}) => {
  return adminTransaction(async ({ transaction }) => {
    return insertPricingModel(
      {
        name,
        organizationId,
        livemode,
        isDefault,
      },
      transaction
    )
  })
}

export const setupCheckoutSession = async ({
  organizationId,
  customerId,
  priceId,
  status,
  type,
  quantity,
  livemode,
  targetSubscriptionId,
  automaticallyUpdateSubscriptions,
  outputMetadata,
  purchaseId,
  outputName,
  preserveBillingCycleAnchor,
}: {
  organizationId: string
  customerId: string
  priceId: string
  status: CheckoutSessionStatus
  type: CheckoutSessionType
  quantity: number
  livemode: boolean
  targetSubscriptionId?: string
  automaticallyUpdateSubscriptions?: boolean
  outputMetadata?: Record<string, any>
  outputName?: string
  purchaseId?: string
  preserveBillingCycleAnchor?: boolean
}) => {
  const billingAddress: BillingAddress = {
    address: {
      line1: '123 Test St',
      line2: 'Apt 1',
      city: 'Test City',
      state: 'Test State',
      postal_code: '12345',
      country: CountryCode.US,
    },
  }
  const coreFields = {
    organizationId,
    customerId,
    customerEmail: 'test@test.com',
    customerName: 'Test Customer',
    billingAddress,
    paymentMethodType: PaymentMethodType.Card,
    automaticallyUpdateSubscriptions: null,
  }
  const addPaymentMethodCheckoutSessionInsert: CheckoutSession.AddPaymentMethodInsert =
    {
      ...coreFields,
      priceId,
      status: status,
      type: CheckoutSessionType.AddPaymentMethod,
      livemode,
      quantity: 1,
      targetSubscriptionId: targetSubscriptionId ?? null,
      outputName: null,
      outputMetadata: outputMetadata ?? {},
      automaticallyUpdateSubscriptions:
        automaticallyUpdateSubscriptions ?? false,
    }
  const productCheckoutSessionInsert: CheckoutSession.ProductInsert =
    {
      ...coreFields,
      priceId,
      status: status,
      type: CheckoutSessionType.Product,
      quantity,
      livemode,
      targetSubscriptionId: null,
      outputName: outputName ?? null,
      invoiceId: null,
      outputMetadata: outputMetadata ?? {},
      automaticallyUpdateSubscriptions: null,
      preserveBillingCycleAnchor: preserveBillingCycleAnchor ?? false,
    }
  const purchaseCheckoutSessionInsert: CheckoutSession.PurchaseInsert =
    {
      ...coreFields,
      priceId,
      status: status,
      type: CheckoutSessionType.Purchase,
      quantity,
      livemode,
      targetSubscriptionId: null,
      outputName: outputName ?? null,
      outputMetadata: outputMetadata ?? {},
      purchaseId: purchaseId ?? 'test',
      automaticallyUpdateSubscriptions: null,
    }
  const activateSubscriptionCheckoutSessionInsert: CheckoutSession.ActivateSubscriptionInsert =
    {
      ...coreFields,
      priceId,
      type: CheckoutSessionType.ActivateSubscription,
      targetSubscriptionId: targetSubscriptionId ?? '',
      outputName: outputName ?? null,
      outputMetadata: outputMetadata ?? {},
      preserveBillingCycleAnchor: preserveBillingCycleAnchor ?? false,
      purchaseId: null,
      invoiceId: null,
      automaticallyUpdateSubscriptions: null,
      livemode,
      status: status,
    }
  let insert: CheckoutSession.Insert
  if (type === CheckoutSessionType.AddPaymentMethod) {
    insert = addPaymentMethodCheckoutSessionInsert
  } else if (type === CheckoutSessionType.Product) {
    insert = productCheckoutSessionInsert
  } else if (type === CheckoutSessionType.Purchase) {
    insert = purchaseCheckoutSessionInsert
  } else if (type === CheckoutSessionType.Invoice) {
    const invoice = await setupInvoice({
      customerId: customerId,
      organizationId: organizationId,
      priceId: priceId,
    })

    insert = {
      ...coreFields,
      priceId: null,
      status: status,
      type: CheckoutSessionType.Invoice,
      preserveBillingCycleAnchor: false,
      quantity,
      livemode,
      targetSubscriptionId: null,
      outputName: outputName ?? null,
      invoiceId: invoice.id,
      purchaseId: null,
      outputMetadata: null,
    }
  } else if (type === CheckoutSessionType.ActivateSubscription) {
    insert = activateSubscriptionCheckoutSessionInsert
  }
  return adminTransaction(async ({ transaction }) => {
    const checkoutSession = await insertCheckoutSession(
      insert,
      transaction
    )
    return checkoutSession
  })
}

export const setupDiscount = async ({
  organizationId,
  name,
  amount,
  amountType = DiscountAmountType.Percent,
  livemode = true,
  code,
}: {
  organizationId: string
  name: string
  amount: number
  code: string
  amountType?: DiscountAmountType
  livemode?: boolean
}) => {
  return adminTransaction(async ({ transaction }) => {
    return insertDiscount(
      {
        organizationId,
        name,
        amount,
        livemode,
        amountType,
        duration: DiscountDuration.Forever,
        numberOfPayments: null,
        active: true,
        code,
        // externalId: core.nanoid(),
      },
      transaction
    )
  })
}

export const setupInvoiceLineItem = async ({
  invoiceId,
  priceId,
  quantity = 1,
  price = 1000,
  livemode = true,
  type = SubscriptionItemType.Static,
  billingRunId,
  ledgerAccountId,
  ledgerAccountCredit,
}: {
  invoiceId: string
  priceId: string
  quantity?: number
  price?: number
  livemode?: boolean
  type?: SubscriptionItemType
  billingRunId?: string
  ledgerAccountId?: string
  ledgerAccountCredit?: number
}) => {
  return adminTransaction(async ({ transaction }) => {
    if (type === SubscriptionItemType.Usage) {
      if (!billingRunId || !ledgerAccountId || !ledgerAccountCredit) {
        throw new Error(
          'Usage invoice line items must have a billing run id, ledger account id, and ledger account credit'
        )
      }
      return insertInvoiceLineItem(
        {
          invoiceId,
          priceId,
          quantity,
          price,
          livemode,
          description: 'Test Description',
          type,
          billingRunId,
          ledgerAccountId,
          ledgerAccountCredit,
        },
        transaction
      )
    }
    return insertInvoiceLineItem(
      {
        invoiceId,
        priceId,
        quantity,
        price,
        livemode,
        description: 'Test Description',
        type,
        billingRunId: null,
        ledgerAccountId: null,
        ledgerAccountCredit: null,
      },
      transaction
    )
  })
}

export const setupFeeCalculation = async ({
  checkoutSessionId,
  organizationId,
  priceId,
  livemode = true,
}: {
  checkoutSessionId: string
  organizationId: string
  priceId: string
  livemode?: boolean
}) => {
  return adminTransaction(async ({ transaction }) => {
    return insertFeeCalculation(
      {
        checkoutSessionId,
        organizationId,
        priceId,
        livemode,
        currency: CurrencyCode.USD,
        type: FeeCalculationType.CheckoutSessionPayment,
        billingAddress: {
          address: {
            line1: '123 Test St',
            line2: 'Apt 1',
            city: 'Test City',
            state: 'Test State',
            postal_code: '12345',
            country: CountryCode.US,
          },
        },
        billingPeriodId: null,
        paymentMethodType: PaymentMethodType.Card,
        discountAmountFixed: 0,
        discountId: null,
        paymentMethodFeeFixed: 0,
        baseAmount: 1000,
        internationalFeePercentage: '0',
        flowgladFeePercentage: '0.65',
        taxAmountFixed: 0,
        pretaxTotal: 1000,
        internalNotes: 'Test Fee Calculation',
      },
      transaction
    )
  })
}

export const setupUsageMeter = async ({
  organizationId,
  name,
  livemode = true,
  pricingModelId,
  slug,
}: {
  organizationId: string
  name: string
  livemode?: boolean
  pricingModelId?: string
  slug?: string
}) => {
  return adminTransaction(async ({ transaction }) => {
    let pricingModelToUseId: string | null = null
    if (pricingModelId) {
      const pricingModel = await selectPricingModelById(
        pricingModelId,
        transaction
      )
      if (!pricingModel) {
        throw new Error('Pricing model not found')
      }
      pricingModelToUseId = pricingModel.id
    } else {
      const defaultPricingModel = await selectDefaultPricingModel(
        { organizationId, livemode },
        transaction
      )
      if (!defaultPricingModel) {
        throw new Error('Default pricing model not found')
      }
      pricingModelToUseId = defaultPricingModel.id
    }
    if (!pricingModelToUseId) {
      throw new Error('setupUsageMeter: Pricing model not found')
    }
    return insertUsageMeter(
      {
        organizationId,
        name,
        livemode,
        pricingModelId: pricingModelToUseId,
        slug: slug ?? `${snakeCase(name)}-${core.nanoid()}`,
      },
      transaction
    )
  })
}

export const setupUserAndApiKey = async ({
  organizationId,
  livemode,
}: {
  organizationId: string
  livemode: boolean
}) => {
  return adminTransaction(async ({ transaction }) => {
    const userInsertResult = await transaction
      .insert(users)
      .values({
        id: `usr_test_${core.nanoid()}`,
        email: `testuser-${core.nanoid()}@example.com`,
        name: 'Test User',
      })
      .returning()
      .then(R.head)

    if (!userInsertResult)
      throw new Error('Failed to create user for API key setup')
    const user = userInsertResult as typeof users.$inferSelect

    await transaction.insert(memberships).values({
      id: `mem_${core.nanoid()}`,
      userId: user.id,
      organizationId,
      focused: true,
      livemode,
    })

    const apiKeyTokenValue = `test_sk_${core.nanoid()}`
    const apiKeyInsertResult = await transaction
      .insert(apiKeys)
      .values({
        id: `fk_test_${core.nanoid()}`,
        token: apiKeyTokenValue,
        organizationId,
        type: FlowgladApiKeyType.Secret,
        livemode: livemode,
        name: 'Test API Key',
        active: true,
      })
      .returning()
      .then(R.head)

    if (!apiKeyInsertResult)
      throw new Error('Failed to create API key')
    const apiKey = apiKeyInsertResult as ApiKey.Record

    return { user, apiKey: { ...apiKey, token: apiKeyTokenValue } }
  })
}

export const setupLedgerAccount = async ({
  subscriptionId,
  usageMeterId,
  livemode,
  organizationId,
}: {
  subscriptionId: string
  usageMeterId: string
  livemode: boolean
  organizationId: string
}) => {
  return adminTransaction(async ({ transaction }) => {
    return insertLedgerAccount(
      { subscriptionId, usageMeterId, livemode, organizationId },
      transaction
    )
  })
}

export const setupTestFeaturesAndProductFeatures = async (params: {
  organizationId: string
  productId: string
  livemode: boolean
  featureSpecs: Array<{
    name: string
    type: FeatureType
    amount?: number
    renewalFrequency?: FeatureUsageGrantFrequency
    usageMeterName?: string
  }>
}): Promise<
  Array<{
    feature: Feature.Record
    productFeature: ProductFeature.Record
  }>
> => {
  const { organizationId, productId, livemode, featureSpecs } = params
  return adminTransaction(async ({ transaction }) => {
    const product = await selectProductById(productId, transaction)
    if (!product) {
      throw new Error('Product not found')
    }
    const createdData: Array<{
      feature: Feature.Record
      productFeature: ProductFeature.Record
    }> = []
    for (const spec of featureSpecs) {
      let usageMeterId: string | null = null
      if (
        spec.type === FeatureType.UsageCreditGrant &&
        spec.usageMeterName
      ) {
        const usageMeter = await setupUsageMeter({
          organizationId,
          name: spec.usageMeterName,
          livemode,
          pricingModelId: product.pricingModelId,
        })
        usageMeterId = usageMeter.id
      }

      const baseFeatureInsertData = {
        organizationId,
        name: spec.name,
        livemode,
        description: `${spec.name} description`,
        slug: `${spec.name.toLowerCase().replace(/\s+/g, '-')}-${core.nanoid(6)}`,
      }

      let featureInsertData: Feature.Insert

      if (spec.type === FeatureType.UsageCreditGrant) {
        featureInsertData = {
          ...baseFeatureInsertData,
          type: FeatureType.UsageCreditGrant,
          amount: spec.amount ?? 0,
          renewalFrequency:
            spec.renewalFrequency ??
            FeatureUsageGrantFrequency.EveryBillingPeriod,
          usageMeterId:
            usageMeterId ?? `meter_dummy_${core.nanoid(4)}`,
          pricingModelId: product.pricingModelId,
          active: true,
        }
      } else if (spec.type === FeatureType.Toggle) {
        featureInsertData = {
          ...baseFeatureInsertData,
          type: FeatureType.Toggle,
          amount: null,
          renewalFrequency: null,
          usageMeterId: null,
          pricingModelId: product.pricingModelId,
          active: true,
        }
      } else {
        throw new Error(
          `Unsupported feature type in test setup: ${spec.type}`
        )
      }

      const feature = await insertFeature(
        featureInsertData,
        transaction
      )
      const productFeature = await insertProductFeature(
        {
          organizationId,
          livemode,
          productId,
          featureId: feature.id,
        },
        transaction
      )
      createdData.push({ feature, productFeature })
    }
    return createdData
  })
}

export const setupUsageEvent = async (
  params: Partial<UsageEvent.Insert> & {
    organizationId: string
    subscriptionId: string
    usageMeterId: string
    amount: number
    priceId: string
    transactionId: string
    customerId: string
  }
): Promise<UsageEvent.Record> => {
  return adminTransaction(async ({ transaction }) => {
    return insertUsageEvent(
      {
        livemode: true,
        usageDate: params.usageDate ?? new Date(),
        properties: params.properties ?? {},
        ...params,
      },
      transaction
    )
  })
}

export const setupLedgerTransaction = async (
  params: Partial<LedgerTransaction.Insert> & {
    organizationId: string
    subscriptionId: string
    type: LedgerTransactionType
  }
): Promise<LedgerTransaction.Record> => {
  return adminTransaction(async ({ transaction }) => {
    return insertLedgerTransaction(
      {
        livemode: true,
        initiatingSourceType: 'test_setup',
        initiatingSourceId: `src_${core.nanoid()}`,
        description: 'Test Ledger Transaction',
        metadata:
          params.metadata === undefined ? null : params.metadata,
        ...params,
      },
      transaction
    )
  })
}

interface CoreLedgerEntryUserParams {
  organizationId: string
  subscriptionId: string
  ledgerTransactionId: string
  ledgerAccountId: string
  amount: number // User provides positive amount; sign/direction handled by logic

  description?: string
  entryTimestamp?: Date
  status?: LedgerEntryStatus
  livemode?: boolean
  metadata?: Record<string, any> | null
  discardedAt?: Date | null
  expiredAt?: Date | null
  billingPeriodId?: string | null
  usageMeterId: string
  appliedToLedgerItemId?: string | null
  claimedByBillingRunId?: string | null
}

// --- Debit Ledger Entry Setup ---
interface SetupDebitUsageCostParams
  extends SetupLedgerEntryCoreParams {
  entryType: LedgerEntryType.UsageCost
  sourceUsageEventId: string
}

interface SetupDebitCreditGrantExpiredParams
  extends SetupLedgerEntryCoreParams {
  entryType: LedgerEntryType.CreditGrantExpired
  sourceUsageCreditId: string
}

interface SetupDebitPaymentRefundedParams
  extends SetupLedgerEntryCoreParams {
  entryType: LedgerEntryType.PaymentRefunded
  sourceRefundId: string
}

interface SetupDebitCreditBalanceAdjustedParams
  extends SetupLedgerEntryCoreParams {
  entryType: LedgerEntryType.CreditBalanceAdjusted
  sourceCreditBalanceAdjustmentId: string
  sourceUsageCreditId: string
}

interface SetupDebitBillingAdjustmentParams
  extends SetupLedgerEntryCoreParams {
  entryType: LedgerEntryType.BillingAdjustment
  sourceBillingPeriodCalculationId: string
}

interface SetupDebitUsageCreditApplicationDebitFromCreditBalanceParams
  extends SetupLedgerEntryCoreParams {
  entryType: LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance
  sourceCreditApplicationId: string
  sourceUsageEventId: string
  sourceUsageCreditId: string
}

export type DebitLedgerEntrySetupParams =
  | SetupDebitUsageCostParams
  | SetupDebitCreditGrantExpiredParams
  | SetupDebitPaymentRefundedParams
  | SetupDebitCreditBalanceAdjustedParams
  | SetupDebitBillingAdjustmentParams
  | SetupDebitUsageCreditApplicationDebitFromCreditBalanceParams

const baseLedgerEntryInsertFieldsFromParams = (
  params: CoreLedgerEntryUserParams & {
    entryType: LedgerEntryType
    amount: number
    status?: LedgerEntryStatus
  }
) => {
  const now = new Date()
  const dbAmount = Math.abs(params.amount)
  return {
    ...ledgerEntryNulledSourceIdColumns,
    organizationId: params.organizationId,
    subscriptionId: params.subscriptionId,
    ledgerTransactionId: params.ledgerTransactionId,
    ledgerAccountId: params.ledgerAccountId,
    livemode: params.livemode ?? true,
    status: params.status ?? LedgerEntryStatus.Posted,
    description:
      params.description ?? `Test Ledger Entry - ${params.entryType}`,
    entryTimestamp: params.entryTimestamp ?? now,
    metadata: params.metadata ?? {},
    discardedAt: params.discardedAt ?? null,
    expiredAt: params.expiredAt ?? null,
    billingPeriodId: params.billingPeriodId ?? null,
    usageMeterId: params.usageMeterId!,
    claimedByBillingRunId:
      params.entryType === LedgerEntryType.UsageCost
        ? (params.claimedByBillingRunId ?? null)
        : null,
    appliedToLedgerItemId: params.appliedToLedgerItemId ?? null,
    amount: dbAmount,
  }
}

const debitEntryInsertFromDebigLedgerParams = (
  params: DebitLedgerEntrySetupParams & CoreLedgerEntryUserParams
) => {
  const baseProps = {
    ...baseLedgerEntryInsertFieldsFromParams(params),
    claimedByBillingRunId: null,
    direction: LedgerEntryDirection.Debit,
  } as const

  let insertData: LedgerEntry.Insert

  switch (params.entryType) {
    case LedgerEntryType.UsageCost:
      insertData = {
        ...baseProps,
        claimedByBillingRunId: params.claimedByBillingRunId ?? null,
        entryType: params.entryType,
        sourceUsageEventId: params.sourceUsageEventId,
      } satisfies LedgerEntry.UsageCostInsert
      break

    case LedgerEntryType.CreditGrantExpired:
      insertData = {
        ...baseProps,
        entryType: params.entryType,
        sourceUsageCreditId: params.sourceUsageCreditId,
        claimedByBillingRunId: null,
      } satisfies LedgerEntry.CreditGrantExpiredInsert
      break

    case LedgerEntryType.PaymentRefunded:
      insertData = {
        ...baseProps,
        entryType: params.entryType,
        sourceRefundId: params.sourceRefundId,
        claimedByBillingRunId: null,
      } satisfies LedgerEntry.PaymentRefundedInsert
      break

    case LedgerEntryType.CreditBalanceAdjusted:
      insertData = {
        ...baseProps,
        entryType: params.entryType,
        sourceCreditBalanceAdjustmentId:
          params.sourceCreditBalanceAdjustmentId,
        sourceUsageCreditId: params.sourceUsageCreditId,
      } satisfies LedgerEntry.CreditBalanceAdjustedInsert
      break

    case LedgerEntryType.BillingAdjustment:
      insertData = {
        ...baseProps,
        entryType: params.entryType,
        sourceBillingPeriodCalculationId:
          params.sourceBillingPeriodCalculationId,
      } satisfies LedgerEntry.BillingAdjustmentInsert
      break

    case LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance:
      insertData = {
        ...baseProps,
        entryType: params.entryType,
        sourceCreditApplicationId: params.sourceCreditApplicationId,
        sourceUsageEventId: params.sourceUsageEventId,
        sourceUsageCreditId: params.sourceUsageCreditId,
      } satisfies LedgerEntry.UsageCreditApplicationDebitFromCreditBalanceInsert
      break

    default:
      throw new Error(`Unsupported entryType for debit ledger entry.`)
  }

  return insertData
}

export const setupDebitLedgerEntry = async (
  params: DebitLedgerEntrySetupParams & CoreLedgerEntryUserParams
): Promise<LedgerEntry.Record> => {
  if (params.amount < 0) {
    throw new Error(
      'setupDebitLedgerEntry: input amount must be greater than or equal to 0.'
    )
  }

  return adminTransaction(async ({ transaction }) => {
    return insertLedgerEntry(
      debitEntryInsertFromDebigLedgerParams(params),
      transaction
    )
  })
}

interface SetupLedgerEntryCoreParams {
  amount: number
  status?: LedgerEntryStatus
  discardedAt?: Date | null
}
// --- Credit Ledger Entry Setup ---
interface SetupCreditCreditGrantRecognizedParams
  extends SetupLedgerEntryCoreParams {
  entryType: LedgerEntryType.CreditGrantRecognized
  sourceUsageCreditId: string
  expiresAt?: Date | null
}

interface SetupCreditCreditBalanceAdjustedParams
  extends SetupLedgerEntryCoreParams {
  entryType: LedgerEntryType.CreditBalanceAdjusted
  sourceCreditBalanceAdjustmentId: string
  sourceUsageCreditId: string
}

interface SetupCreditBillingAdjustmentParams
  extends SetupLedgerEntryCoreParams {
  entryType: LedgerEntryType.BillingAdjustment
  sourceBillingPeriodCalculationId: string
}

interface SetupCreditUsageCreditApplicationCreditTowardsUsageCostParams
  extends SetupLedgerEntryCoreParams {
  entryType: LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost
  sourceCreditApplicationId: string
  sourceUsageEventId: string
  sourceUsageCreditId: string
}

export type CreditLedgerEntrySetupParams =
  | SetupCreditCreditGrantRecognizedParams
  | SetupCreditCreditBalanceAdjustedParams
  | SetupCreditBillingAdjustmentParams
  | SetupCreditUsageCreditApplicationCreditTowardsUsageCostParams

const creditLedgerEntryInsertFromCreditLedgerParams = (
  params: CreditLedgerEntrySetupParams & CoreLedgerEntryUserParams
) => {
  if (params.amount < 0) {
    throw new Error(
      'setupCreditLedgerEntry: input amount must be greater than or equal to 0.'
    )
  }

  const baseProps = {
    ...baseLedgerEntryInsertFieldsFromParams(params),
    claimedByBillingRunId: null,
    direction: LedgerEntryDirection.Credit,
  } as const

  let insertData: LedgerEntry.Insert

  switch (params.entryType) {
    case LedgerEntryType.CreditGrantRecognized:
      insertData = {
        ...baseProps,
        entryType: params.entryType,
        sourceUsageCreditId: params.sourceUsageCreditId,
      } satisfies LedgerEntry.CreditGrantRecognizedInsert
      break

    case LedgerEntryType.CreditBalanceAdjusted:
      insertData = {
        ...baseProps,
        entryType: params.entryType,
        sourceCreditBalanceAdjustmentId:
          params.sourceCreditBalanceAdjustmentId,
        sourceUsageCreditId: params.sourceUsageCreditId,
      } satisfies LedgerEntry.CreditBalanceAdjustedInsert
      break

    case LedgerEntryType.BillingAdjustment:
      insertData = {
        ...baseProps,
        entryType: params.entryType,
        sourceBillingPeriodCalculationId:
          params.sourceBillingPeriodCalculationId,
      } satisfies LedgerEntry.BillingAdjustmentInsert
      break

    case LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost:
      insertData = {
        ...baseProps,
        entryType: params.entryType,
        sourceCreditApplicationId: params.sourceCreditApplicationId,
        sourceUsageEventId: params.sourceUsageEventId,
        sourceUsageCreditId: params.sourceUsageCreditId,
      } satisfies LedgerEntry.UsageCreditApplicationCreditTowardsUsageCostInsert
      break

    default:
      throw new Error(
        `Unsupported entryType for credit ledger entry.`
      )
  }

  return insertData
}

export const setupCreditLedgerEntry = async (
  params: CreditLedgerEntrySetupParams & CoreLedgerEntryUserParams
): Promise<LedgerEntry.Record> => {
  return adminTransaction(async ({ transaction }) => {
    return insertLedgerEntry(
      creditLedgerEntryInsertFromCreditLedgerParams(params),
      transaction
    )
  })
}

export const setupUsageCredit = async (
  params: Partial<UsageCredit.Insert> & {
    organizationId: string
    subscriptionId: string
    creditType: string
    issuedAmount: number
    usageMeterId: string
  }
): Promise<UsageCredit.Record> => {
  return adminTransaction(async ({ transaction }) => {
    const now = new Date()
    return insertUsageCredit(
      {
        livemode: params.livemode ?? true,
        issuedAt: params.issuedAt ?? now,
        sourceReferenceId:
          params.sourceReferenceId ?? `src_ref_${core.nanoid()}`,
        metadata: params.metadata ?? {},
        notes: params.notes ?? 'Test Usage Credit',
        status: params.status ?? UsageCreditStatus.Posted,
        sourceReferenceType:
          UsageCreditSourceReferenceType.InvoiceSettlement,
        paymentId: params.paymentId ?? null,
        expiresAt: params.expiresAt ?? null,
        ...params,
      },
      transaction
    )
  })
}

export const setupUsageCreditApplication = async (
  params: Partial<UsageCreditApplication.Insert> & {
    organizationId: string
    usageCreditId: string
    amountApplied: number
    usageEventId: string
    status?: UsageCreditApplicationStatus
  }
): Promise<UsageCreditApplication.Record> => {
  return adminTransaction(async ({ transaction }) => {
    const now = new Date()
    return insertUsageCreditApplication(
      {
        livemode: true,
        appliedAt: now,
        status: params.status ?? UsageCreditApplicationStatus.Posted,
        ...params,
      },
      transaction
    )
  })
}

export const setupUsageCreditBalanceAdjustment = async (
  params: Partial<
    typeof usageCreditBalanceAdjustments.$inferInsert
  > & {
    organizationId: string
    adjustedUsageCreditId: string
    adjustmentType: string
    amountAdjusted: number
    currency: CurrencyCode
    reason: string
  }
): Promise<typeof usageCreditBalanceAdjustments.$inferSelect> => {
  return adminTransaction(async ({ transaction }) => {
    const now = new Date()
    // @ts-expect-error Assume insertUsageCreditBalanceAdjustment is defined and imported
    return insertUsageCreditBalanceAdjustment(
      {
        livemode: true,
        adjustmentInitiatedAt: now,
        adjustedByUserId: `user_${core.nanoid()}`,
        metadata: {},
        notes: 'Test Usage Credit Balance Adjustment',
        ...params,
      },
      transaction
    )
  })
}

export const setupRefund = async (
  params: Partial<Refund.Insert> & {
    organizationId: string
    paymentId: string
    subscriptionId: string
    amount: number
    currency: CurrencyCode
  }
): Promise<typeof refunds.$inferSelect> => {
  return adminTransaction(async ({ transaction }) => {
    return insertRefund(
      {
        livemode: true,
        status: RefundStatus.Succeeded,
        reason: 'Test Refund',
        gatewayRefundId: `ref_gw_${core.nanoid()}`,
        refundProcessedAt: new Date(),
        notes: 'Test Refund Notes',
        ...params,
      },
      transaction
    )
  })
}

export type SMPCalculationStatus =
  | 'active'
  | 'superseded'
  | 'pending_confirmation'
export type SMPCalculationType =
  | 'billing_run'
  | 'interim_estimate'
  | 'adjustment_recalculation'

export const setupSubscriptionMeterPeriodCalculation = async (
  params: Partial<
    typeof subscriptionMeterPeriodCalculations.$inferInsert
  > & {
    organizationId: string
    subscriptionId: string
    usageMeterId: string
    billingPeriodId: string
    calculationRunId: string
    totalRawUsageAmount: number
    creditsAppliedAmount: number
    netBilledAmount: number
    currency: CurrencyCode
  }
): Promise<
  typeof subscriptionMeterPeriodCalculations.$inferSelect
> => {
  return adminTransaction(async ({ transaction }) => {
    const now = new Date()
    // @ts-expect-error Assume insertSubscriptionMeterPeriodCalculation is defined and imported
    return insertSubscriptionMeterPeriodCalculation(
      {
        livemode: true,
        calculatedAt: now,
        calculationType: 'billing_run' as SMPCalculationType,
        status: 'active' as SMPCalculationStatus,
        metadata: {},
        notes: 'Test SMPC',
        ...params,
      },
      transaction
    )
  })
}

type QuickLedgerEntry =
  | CreditLedgerEntrySetupParams
  | DebitLedgerEntrySetupParams

type CreditLedgerEntryType =
  | LedgerEntryType.CreditGrantRecognized
  | LedgerEntryType.CreditBalanceAdjusted
  | LedgerEntryType.BillingAdjustment
  | LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost

type DebitLedgerEntryType =
  | LedgerEntryType.UsageCost
  | LedgerEntryType.CreditGrantExpired
  | LedgerEntryType.PaymentRefunded
  | LedgerEntryType.CreditBalanceAdjusted
  | LedgerEntryType.BillingAdjustment
  | LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance

const debitableEntryTypes = [
  LedgerEntryType.UsageCost,
  LedgerEntryType.CreditGrantExpired,
  LedgerEntryType.PaymentRefunded,
  LedgerEntryType.CreditBalanceAdjusted,
  LedgerEntryType.BillingAdjustment,
  LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance,
] as const

const creditableEntryTypes = [
  LedgerEntryType.CreditGrantRecognized,
  LedgerEntryType.CreditBalanceAdjusted,
  LedgerEntryType.BillingAdjustment,
  LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost,
] as const

export const setupLedgerEntries = async (params: {
  organizationId: string
  subscriptionId: string
  ledgerTransactionId: string
  ledgerAccountId: string
  usageMeterId: string
  entries: QuickLedgerEntry[]
}) => {
  return await adminTransaction(async ({ transaction }) => {
    return bulkInsertLedgerEntries(
      params.entries.map((entry) => {
        if (
          debitableEntryTypes.includes(
            entry.entryType as DebitLedgerEntryType
          )
        ) {
          return debitEntryInsertFromDebigLedgerParams({
            ...entry,
            organizationId: params.organizationId,
            subscriptionId: params.subscriptionId,
            ledgerTransactionId: params.ledgerTransactionId,
            ledgerAccountId: params.ledgerAccountId,
            usageMeterId: params.usageMeterId,
          } as DebitLedgerEntrySetupParams &
            CoreLedgerEntryUserParams)
        } else if (
          creditableEntryTypes.includes(
            entry.entryType as CreditLedgerEntryType
          )
        ) {
          return creditLedgerEntryInsertFromCreditLedgerParams({
            ...entry,
            organizationId: params.organizationId,
            subscriptionId: params.subscriptionId,
            ledgerTransactionId: params.ledgerTransactionId,
            ledgerAccountId: params.ledgerAccountId,
            usageMeterId: params.usageMeterId,
          } as CreditLedgerEntrySetupParams &
            CoreLedgerEntryUserParams)
        } else {
          throw new Error(
            `Unsupported entry type: ${entry.entryType}`
          )
        }
      }),
      transaction
    )
  })
}

export const setupToggleFeature = async (
  params: Partial<Omit<Feature.ToggleInsert, 'type'>> & {
    organizationId: string
    name: string
    livemode: boolean
  }
) => {
  return adminTransaction(async ({ transaction }) => {
    const pricingModelId =
      params.pricingModelId ??
      (
        await selectDefaultPricingModel(
          {
            organizationId: params.organizationId,
            livemode: params.livemode,
          },
          transaction
        )
      )?.id
    const insert: Feature.ToggleInsert = {
      type: FeatureType.Toggle,
      description: params.description ?? '',
      slug: params.slug ?? `test-feature-${core.nanoid()}`,
      amount: null,
      usageMeterId: null,
      renewalFrequency: null,
      pricingModelId: pricingModelId ?? '',
      ...params,
    }
    return insertFeature(insert, transaction)
  })
}

export const setupUsageCreditGrantFeature = async (
  params: Partial<Omit<Feature.UsageCreditGrantInsert, 'type'>> & {
    organizationId: string
    name: string
    usageMeterId: string
    renewalFrequency: FeatureUsageGrantFrequency
    livemode: boolean
  }
): Promise<Feature.UsageCreditGrantRecord> => {
  return adminTransaction(async ({ transaction }) => {
    const pricingModelId =
      params.pricingModelId ??
      (
        await selectDefaultPricingModel(
          {
            organizationId: params.organizationId,
            livemode: params.livemode,
          },
          transaction
        )
      )?.id
    const insert: Feature.UsageCreditGrantInsert = {
      type: FeatureType.UsageCreditGrant,
      description: params.description ?? '',
      slug: params.slug ?? `test-feature-${core.nanoid()}`,
      amount: params.amount ?? 1,
      pricingModelId: pricingModelId ?? '',
      ...params,
    }
    return insertFeature(
      insert,
      transaction
    ) as Promise<Feature.UsageCreditGrantRecord>
  })
}

export const setupProductFeature = async (
  params: Partial<ProductFeature.Insert> & {
    productId: string
    featureId: string
    expiredAt?: Date | null
    organizationId: string
  }
) => {
  return adminTransaction(async ({ transaction }) => {
    return insertProductFeature(
      {
        livemode: true,
        expiredAt: params.expiredAt ?? null,
        ...params,
      },
      transaction
    )
  })
}

export const setupSubscriptionItemFeature = async (
  params: Partial<SubscriptionItemFeature.Insert> & {
    subscriptionItemId: string
    usageMeterId: string
    featureId: string
    productFeatureId: string
  }
) => {
  return adminTransaction(async ({ transaction }) => {
    return insertSubscriptionItemFeature(
      {
        livemode: true,
        type: FeatureType.UsageCreditGrant,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        amount: params.amount ?? 1,
        ...params,
      },
      transaction
    )
  })
}

export const setupSubscriptionItemFeatureUsageCreditGrant = async (
  params: Partial<SubscriptionItemFeature.Insert> & {
    subscriptionItemId: string
    usageMeterId: string
    featureId: string
    productFeatureId: string
  }
): Promise<SubscriptionItemFeature.UsageCreditGrantClientRecord> => {
  return adminTransaction(async ({ transaction }) => {
    return insertSubscriptionItemFeature(
      {
        livemode: true,
        type: FeatureType.UsageCreditGrant,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        amount: params.amount ?? 1,
        ...params,
      },
      transaction
    ) as Promise<SubscriptionItemFeature.UsageCreditGrantClientRecord>
  })
}

/**
 * @description A comprehensive test setup utility for creating a complete usage-based
 * billing and ledger scenario. It programmatically creates and links all necessary
 * database records: an organization, customer, product, price, subscription, usage
 * meter, and an active billing period.
 *
 * Based on the input parameters, it can then:
 * 1. Generate a series of `UsageEvent` records and their corresponding `UsageCost` ledger entries.
 * 2. Populate the ledger with arbitrary initial entries (`quickEntries`) to simulate
 *    pre-existing balances or administrative adjustments.
 *
 * @param params An object containing optional arrays for `usageEventAmounts` and `quickEntries`.
 * @returns A promise that resolves to an object containing all the created entities,
 * providing a fully hydrated test environment.
 */
export const setupUsageLedgerScenario = async (params: {
  usageEventAmounts?: number[]
  quickEntries?: QuickLedgerEntry[]
  customerArgs?: Partial<Parameters<typeof setupCustomer>[0]>
  paymentMethodArgs?: Partial<
    Parameters<typeof setupPaymentMethod>[0]
  >
  subscriptionArgs?: Partial<Parameters<typeof setupSubscription>[0]>
  priceArgs?: Partial<Parameters<typeof setupPrice>[0]>
  subscriptionItemArgs?: Partial<
    Parameters<typeof setupSubscriptionItem>[0]
  >
  livemode?: boolean
}) => {
  const livemode = params.livemode ?? true
  const { organization, product, pricingModel } = await setupOrg()
  const customer = await setupCustomer({
    organizationId: organization.id,
    email: 'test@test.com',
    livemode,
    ...(params.customerArgs ?? {}),
  })
  const paymentMethod = await setupPaymentMethod({
    organizationId: organization.id,
    customerId: customer.id,
    livemode,
    ...(params.paymentMethodArgs ?? {}),
  })
  const usageMeter = await setupUsageMeter({
    organizationId: organization.id,
    name: 'Test Usage Meter',
    livemode,
    pricingModelId: pricingModel.id,
  })
  const price = await setupPrice({
    productId: product.id,
    name: 'Test Price',
    type: PriceType.Usage,
    unitPrice: 1000,
    intervalUnit: IntervalUnit.Month,
    intervalCount: 1,
    livemode,
    isDefault: false,
    setupFeeAmount: 0,
    usageMeterId: usageMeter.id,
    ...(params.priceArgs ?? {}),
  })
  const subscription = await setupSubscription({
    organizationId: organization.id,
    customerId: customer.id,
    paymentMethodId: paymentMethod.id,
    priceId: price.id,
    interval: IntervalUnit.Month,
    intervalCount: 1,
    ...(params.subscriptionArgs ?? {}),
  })

  const subscriptionItem = await setupSubscriptionItem({
    subscriptionId: subscription.id,
    name: 'Test Subscription Item',
    quantity: 1,
    unitPrice: price.unitPrice,
    type: SubscriptionItemType.Usage,
    usageMeterId: usageMeter.id,
    usageEventsPerUnit: 1,
    ...(params.subscriptionItemArgs ?? {}),
  })
  const billingPeriod = await setupBillingPeriod({
    subscriptionId: subscription.id,
    startDate: subscription.currentBillingPeriodStart || new Date(),
    endDate:
      subscription.currentBillingPeriodEnd ||
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status: BillingPeriodStatus.Active,
    livemode,
  })
  const usageEvents: UsageEvent.Record[] = []
  for (const amount of params.usageEventAmounts ?? []) {
    const usageEvent = await setupUsageEvent({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter.id,
      amount,
      priceId: price.id,
      billingPeriodId: billingPeriod.id,
      transactionId: core.nanoid(),
      customerId: customer.id,
      livemode,
    })
    usageEvents.push(usageEvent)
  }

  const ledgerAccount = await setupLedgerAccount({
    organizationId: organization.id,
    subscriptionId: subscription.id,
    usageMeterId: usageMeter.id,
    livemode,
  })
  const ledgerTransactions: LedgerTransaction.Record[] = []
  const ledgerEntries: LedgerEntry.Record[] = []
  if (params.quickEntries && params.quickEntries.length > 0) {
    const ledgerTransaction = await setupLedgerTransaction({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      type: LedgerTransactionType.AdminCreditAdjusted,
    })
    const ledgerEntriesCreated = await setupLedgerEntries({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      ledgerTransactionId: ledgerTransaction.id,
      ledgerAccountId: ledgerAccount.id,
      usageMeterId: usageMeter.id,
      entries: params.quickEntries,
    })
    ledgerEntries.push(...ledgerEntriesCreated)
    ledgerTransactions.push(ledgerTransaction)
  }
  if (usageEvents.length > 0) {
    const ledgerTransaction = await setupLedgerTransaction({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      type: LedgerTransactionType.UsageEventProcessed,
    })
    const ledgerEntriesCreated = await setupLedgerEntries({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      ledgerTransactionId: ledgerTransaction.id,
      ledgerAccountId: ledgerAccount.id,
      usageMeterId: usageMeter.id,
      entries: usageEvents.map((usageEvent) => ({
        entryType: LedgerEntryType.UsageCost,
        sourceUsageEventId: usageEvent.id,
        amount: usageEvent.amount,
        status: LedgerEntryStatus.Posted,
      })),
    })
    ledgerEntries.push(...ledgerEntriesCreated)
    ledgerTransactions.push(ledgerTransaction)
  }
  return {
    organization,
    product,
    pricingModel,
    customer,
    paymentMethod,
    price,
    subscription,
    usageMeter,
    billingPeriod,
    subscriptionItem,
    ledgerAccount,
    ledgerEntries,
    ledgerTransactions,
  }
}

export const setupDiscountRedemption = async (params: {
  discount: Discount.Record
  purchaseId: string
}) => {
  return adminTransaction(async ({ transaction }) => {
    if (params.discount.duration === DiscountDuration.Once) {
      return insertDiscountRedemption(
        {
          purchaseId: params.purchaseId,
          livemode: true,
          duration: DiscountDuration.Forever,
          numberOfPayments: null,
          discountName: params.discount.name,
          discountCode: params.discount.code,
          discountId: params.discount.id,
          discountAmount: params.discount.amount,
          discountAmountType: params.discount.amountType,
        },
        transaction
      )
    } else if (
      params.discount.duration === DiscountDuration.NumberOfPayments
    ) {
      return insertDiscountRedemption(
        {
          purchaseId: params.purchaseId,
          livemode: true,
          duration: DiscountDuration.NumberOfPayments,
          numberOfPayments: params.discount.numberOfPayments,
          discountName: params.discount.name,
          discountCode: params.discount.code,
          discountId: params.discount.id,
          discountAmount: params.discount.amount,
          discountAmountType: params.discount.amountType,
        },
        transaction
      )
    } else if (
      params.discount.duration === DiscountDuration.Forever
    ) {
      return insertDiscountRedemption(
        {
          purchaseId: params.purchaseId,
          livemode: true,
          duration: DiscountDuration.Forever,
          numberOfPayments: null,
          discountName: params.discount.name,
          discountCode: params.discount.code,
          discountId: params.discount.id,
          discountAmount: params.discount.amount,
          discountAmountType: params.discount.amountType,
        },
        transaction
      )
    } else {
      throw new Error('Invalid discount duration')
    }
  })
}
