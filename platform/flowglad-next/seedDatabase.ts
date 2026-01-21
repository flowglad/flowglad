import { snakeCase } from 'change-case'
import { sql } from 'drizzle-orm'
import * as R from 'ramda'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import db from '@/db/client'
import { type ApiKey, apiKeys } from '@/db/schema/apiKeys'
import type { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { BillingRun } from '@/db/schema/billingRuns'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import { type Country, countries } from '@/db/schema/countries'
import type { Discount } from '@/db/schema/discounts'
import type { Feature } from '@/db/schema/features'
import type { invoicesInsertSchema } from '@/db/schema/invoices'
import {
  type LedgerEntry,
  ledgerEntryNulledSourceIdColumns,
} from '@/db/schema/ledgerEntries'
import { type LedgerTransaction } from '@/db/schema/ledgerTransactions'
import { memberships } from '@/db/schema/memberships'
import type { BillingAddress } from '@/db/schema/organizations'
import type { Payment } from '@/db/schema/payments'
import { nulledPriceColumns, type Price } from '@/db/schema/prices'
import type { ProductFeature } from '@/db/schema/productFeatures'
import type { Purchase } from '@/db/schema/purchases'
import type { Refund, refunds } from '@/db/schema/refunds'
import type { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { subscriptionMeterPeriodCalculations } from '@/db/schema/subscriptionMeterPeriodCalculations'
import type { Subscription } from '@/db/schema/subscriptions'
import { type UsageCreditApplication } from '@/db/schema/usageCreditApplications'
import type {
  UsageCreditBalanceAdjustment,
  usageCreditBalanceAdjustments,
} from '@/db/schema/usageCreditBalanceAdjustments'
import { type UsageCredit } from '@/db/schema/usageCredits'
import { type UsageEvent } from '@/db/schema/usageEvents'
import { users } from '@/db/schema/users'
import { insertBillingPeriodItem } from '@/db/tableMethods/billingPeriodItemMethods'
import {
  insertBillingPeriod,
  selectBillingPeriodById,
} from '@/db/tableMethods/billingPeriodMethods'
import { safelyInsertBillingRun } from '@/db/tableMethods/billingRunMethods'
import { insertCheckoutSession } from '@/db/tableMethods/checkoutSessionMethods'
import { selectCountries } from '@/db/tableMethods/countryMethods'
import { insertCustomer } from '@/db/tableMethods/customerMethods'
import { insertDiscount } from '@/db/tableMethods/discountMethods'
import { insertDiscountRedemption } from '@/db/tableMethods/discountRedemptionMethods'
import { insertFeature } from '@/db/tableMethods/featureMethods'
import { insertFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { insertInvoiceLineItem } from '@/db/tableMethods/invoiceLineItemMethods'
import { insertInvoice } from '@/db/tableMethods/invoiceMethods'
import { insertLedgerAccount } from '@/db/tableMethods/ledgerAccountMethods'
import {
  bulkInsertLedgerEntries,
  insertLedgerEntry,
} from '@/db/tableMethods/ledgerEntryMethods'
import { insertLedgerTransaction } from '@/db/tableMethods/ledgerTransactionMethods'
import { insertMembership } from '@/db/tableMethods/membershipMethods'
import { insertOrganization } from '@/db/tableMethods/organizationMethods'
import { safelyInsertPaymentMethod } from '@/db/tableMethods/paymentMethodMethods'
import { insertPayment } from '@/db/tableMethods/paymentMethods'
import {
  insertPrice,
  safelyInsertPrice,
  selectPriceById,
} from '@/db/tableMethods/priceMethods'
import {
  insertPricingModel,
  selectDefaultPricingModel,
  selectPricingModelById,
} from '@/db/tableMethods/pricingModelMethods'
import { insertProductFeature } from '@/db/tableMethods/productFeatureMethods'
import {
  insertProduct,
  selectProductById,
} from '@/db/tableMethods/productMethods'
import { insertPurchase } from '@/db/tableMethods/purchaseMethods'
import { insertRefund } from '@/db/tableMethods/refundMethods'
import { insertResourceClaim } from '@/db/tableMethods/resourceClaimMethods'
import { insertResource } from '@/db/tableMethods/resourceMethods'
import { insertSubscriptionItemFeature } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { insertSubscriptionItem } from '@/db/tableMethods/subscriptionItemMethods'
import {
  insertSubscription,
  selectSubscriptionById,
} from '@/db/tableMethods/subscriptionMethods'
import { insertUsageCreditApplication } from '@/db/tableMethods/usageCreditApplicationMethods'
import { insertUsageCreditBalanceAdjustment } from '@/db/tableMethods/usageCreditBalanceAdjustmentMethods'
import { insertUsageCredit } from '@/db/tableMethods/usageCreditMethods'
import { insertUsageEvent } from '@/db/tableMethods/usageEventMethods'
import {
  derivePricingModelIdFromUsageMeter,
  insertUsageMeter,
} from '@/db/tableMethods/usageMeterMethods'
import { insertUser } from '@/db/tableMethods/userMethods'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  BusinessOnboardingStatus,
  type CheckoutSessionStatus,
  CheckoutSessionType,
  CountryCode,
  CurrencyCode,
  DiscountAmountType,
  DiscountDuration,
  FeatureType,
  FeatureUsageGrantFrequency,
  FeeCalculationType,
  FlowgladApiKeyType,
  IntervalUnit,
  InvoiceStatus,
  InvoiceType,
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  LedgerTransactionType,
  NormalBalanceType,
  PaymentMethodType,
  type PaymentStatus,
  PriceType,
  PurchaseStatus,
  RefundStatus,
  StripeConnectContractType,
  SubscriptionItemType,
  SubscriptionStatus,
  UsageCreditApplicationStatus,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
  type UsageMeterAggregationType,
} from '@/types'
import { core, isNil } from '@/utils/core'
import { countryNameByCountryCode } from '@/utils/countries'
import { projectPriceFieldsOntoPurchaseFields } from '@/utils/purchaseHelpers'

if (process.env.VERCEL_ENV === 'production') {
  throw new Error(
    'attempted to access seedDatabase.ts in production. This should never happen.'
  )
}

const insertCountries = async () => {
  const countryInserts: Country.Insert[] = Object.entries(
    countryNameByCountryCode
  ).map(([code, name]) => ({
    code: code as CountryCode,
    name,
  }))
  await db
    .insert(countries)
    .values(countryInserts)
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
  stripeConnectContractType?: StripeConnectContractType
  countryCode?: CountryCode
}) => {
  await insertCountries()
  return adminTransaction(async ({ transaction }) => {
    const [country] = await selectCountries(
      { code: params?.countryCode ?? CountryCode.US },
      transaction
    )
    const organization = await insertOrganization(
      {
        name: `Flowglad Test ${core.nanoid()}`,
        countryId: country.id,
        defaultCurrency: CurrencyCode.USD,
        monthlyBillingVolumeFreeTier:
          params?.monthlyBillingVolumeFreeTier ?? undefined,
        feePercentage: params?.feePercentage ?? undefined,
        onboardingStatus: BusinessOnboardingStatus.FullyOnboarded,
        stripeConnectContractType:
          params?.stripeConnectContractType ??
          StripeConnectContractType.Platform,
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

    // Create both live and testmode default pricing models
    const livePricingModel = await insertPricingModel(
      {
        name: 'Flowglad Test Pricing Model',
        organizationId: organization.id,
        livemode: true,
        isDefault: true,
      },
      transaction
    )

    const testmodePricingModel = await insertPricingModel(
      {
        name: 'Flowglad Test Pricing Model (testmode)',
        organizationId: organization.id,
        livemode: false,
        isDefault: true,
      },
      transaction
    )

    const product = await insertProduct(
      {
        name: 'Default Product',
        organizationId: organization.id,
        livemode: true,
        description: 'Default product for organization',
        imageURL: 'https://flowglad.com/logo.png',
        active: true,
        singularQuantityLabel: 'seat',
        pluralQuantityLabel: 'seats',
        pricingModelId: livePricingModel.id,
        externalId: null,
        default: true,
        slug: `default-product-${core.nanoid()}`,
      },
      transaction
    )

    const price = (await insertPrice(
      {
        ...nulledPriceColumns,
        productId: product.id,
        name: 'Default Product Price',
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        active: true,
        isDefault: true,
        unitPrice: 1000,
        trialPeriodDays: 0,
        currency: CurrencyCode.USD,
        externalId: null,
        slug: `default-product-price-${core.nanoid()}`,
      },
      transaction
    )) as Price.SubscriptionRecord
    return {
      organization,
      product,
      price,
      pricingModel: livePricingModel,
      testmodePricingModel,
    }
  })
}

export const setupProduct = async ({
  organizationId,
  name,
  livemode,
  pricingModelId,
  active = true,
  default: isDefault = false,
  slug,
}: {
  organizationId: string
  name: string
  livemode?: boolean
  pricingModelId: string
  active?: boolean
  default?: boolean
  slug?: string
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
        singularQuantityLabel: 'seat',
        pluralQuantityLabel: 'seats',
        pricingModelId,
        externalId: null,
        default: isDefault,
        slug: slug ?? `flowglad-test-product-price+${core.nanoid()}`,
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
  return adminTransaction(
    async ({
      transaction,
      cacheRecomputationContext,
      invalidateCache,
      emitEvent,
      enqueueLedgerCommand,
    }) => {
      const ctx = {
        transaction,
        cacheRecomputationContext,
        invalidateCache: invalidateCache!,
        emitEvent: emitEvent!,
        enqueueLedgerCommand: enqueueLedgerCommand!,
      }
      return safelyInsertPaymentMethod(
        {
          customerId: params.customerId,
          type: params.type ?? PaymentMethodType.Card,
          livemode: params.livemode ?? true,
          default: params.default ?? true,
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
        ctx
      )
    }
  )
}

interface SetupCustomerParams {
  organizationId: string
  stripeCustomerId?: string
  invoiceNumberBase?: string
  email?: string
  livemode?: boolean
  pricingModelId?: string
  externalId?: string
  userId?: string
  name?: string
}

export const setupCustomer = async (params: SetupCustomerParams) => {
  return adminTransaction(async ({ transaction }) => {
    const email = params.email ?? `test+${core.nanoid()}@test.com`
    const livemode = params.livemode ?? true

    // Derive pricingModelId from default pricing model if not provided
    let pricingModelId = params.pricingModelId
    if (!pricingModelId) {
      const defaultPricingModel = await selectDefaultPricingModel(
        { organizationId: params.organizationId, livemode },
        transaction
      )
      if (!defaultPricingModel) {
        throw new Error(
          `No default pricing model found for organization ${params.organizationId} with livemode=${livemode}`
        )
      }
      pricingModelId = defaultPricingModel.id
    }

    return insertCustomer(
      {
        organizationId: params.organizationId,
        email,
        name: params.name ?? email,
        externalId: params.externalId?.trim() || core.nanoid(),
        livemode,
        stripeCustomerId:
          params.stripeCustomerId ?? `cus_${core.nanoid()}`,
        invoiceNumberBase: params.invoiceNumberBase ?? core.nanoid(),
        userId: params.userId,
        pricingModelId,
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
  paymentMethodId?: string | null
  defaultPaymentMethodId?: string
  priceId: string
  interval?: IntervalUnit
  intervalCount?: number
  livemode?: boolean
  currentBillingPeriodEnd?: number
  currentBillingPeriodStart?: number
  status?: SubscriptionStatus
  trialEnd?: number
  renews?: boolean
  startDate?: number
  cancelScheduledAt?: number
  isFreePlan?: boolean
  cancellationReason?: string | null
  replacedBySubscriptionId?: string | null
  name?: string
  canceledAt?: number | null
  metadata?: any
  billingCycleAnchorDate?: number
  doNotCharge?: boolean
}): Promise<Subscription.Record> => {
  if (
    params.doNotCharge &&
    (params.paymentMethodId || params.defaultPaymentMethodId)
  ) {
    throw new Error(
      'doNotCharge subscriptions cannot have payment methods'
    )
  }
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
          name: params.name ?? null,
          runBillingAtPeriodStart:
            price.type === PriceType.Subscription ? true : false,
          externalId: null,
          startDate: Date.now(),
          renews: false,
          isFreePlan: params.isFreePlan ?? false,
          doNotCharge: params.doNotCharge ?? false,
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
            params.billingCycleAnchorDate ?? Date.now(),
          currentBillingPeriodEnd:
            params.currentBillingPeriodEnd ??
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).getTime(),
          currentBillingPeriodStart:
            params.currentBillingPeriodStart ?? Date.now(),
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
          startDate: params.startDate ?? Date.now(),
          renews: isNil(params.renews) ? true : params.renews,
          isFreePlan: params.isFreePlan ?? false,
          cancellationReason: params.cancellationReason ?? null,
          replacedBySubscriptionId:
            params.replacedBySubscriptionId ?? null,
          doNotCharge: params.doNotCharge ?? false,
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
  startDate: number | Date
  endDate: number | Date
  status?: BillingPeriodStatus
  livemode?: boolean
}) => {
  return adminTransaction(async ({ transaction }) => {
    return insertBillingPeriod(
      {
        subscriptionId,
        startDate:
          startDate instanceof Date ? startDate.getTime() : startDate,
        endDate:
          endDate instanceof Date ? endDate.getTime() : endDate,
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
  scheduledFor = Date.now(),
  subscriptionId,
  livemode = true,
  stripePaymentIntentId,
  lastPaymentIntentEventTimestamp,
  isAdjustment = false,
}: Partial<BillingRun.Insert> & {
  billingPeriodId: string
  paymentMethodId: string
  subscriptionId: string
}): Promise<BillingRun.Record> => {
  return await adminTransaction(async ({ transaction }) => {
    return safelyInsertBillingRun(
      {
        billingPeriodId,
        paymentMethodId,
        status,
        scheduledFor,
        livemode,
        subscriptionId,
        stripePaymentIntentId,
        lastPaymentIntentEventTimestamp,
        isAdjustment,
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
      if (type === SubscriptionItemType.Usage) {
        throw new Error(
          'Usage type is not allowed for billing period items'
        )
      }
      const insert: BillingPeriodItem.Insert = {
        billingPeriodId,
        quantity,
        unitPrice,
        name,
        description,
        type,
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
        discountRedemptionId: null,
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
        invoiceDate: Date.now(),
        dueDate: Date.now(),
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

// Strict validation schemas for setupPrice to catch test data errors
const baseSetupPriceSchemaWithoutProductId = z.object({
  name: z.string(),
  unitPrice: z.number(),
  livemode: z.boolean(),
  isDefault: z.boolean(),
  currency: z.enum(CurrencyCode).optional(),
  externalId: z.string().optional(),
  active: z.boolean().optional(),
  slug: z.string().optional(),
})

const baseSetupPriceSchema =
  baseSetupPriceSchemaWithoutProductId.extend({
    productId: z.string(),
  })

const setupSinglePaymentPriceSchema = baseSetupPriceSchema.extend({
  type: z.literal(PriceType.SinglePayment),
  // These fields should NOT be present for SinglePayment prices
  intervalUnit: z.never().optional(),
  intervalCount: z.never().optional(),
  trialPeriodDays: z.never().optional(),
  usageMeterId: z.never().optional(),
})

const setupSubscriptionPriceSchema = baseSetupPriceSchema.extend({
  type: z.literal(PriceType.Subscription),
  intervalUnit: z.enum(IntervalUnit).optional(),
  intervalCount: z.number().optional(),
  trialPeriodDays: z.number().optional(),
  usageMeterId: z.never().optional(), // Subscriptions don't use usage meters
})

// Usage prices do NOT have productId - they belong to usage meters
const setupUsagePriceSchema =
  baseSetupPriceSchemaWithoutProductId.extend({
    type: z.literal(PriceType.Usage),
    intervalUnit: z.enum(IntervalUnit).optional(),
    intervalCount: z.number().optional(),
    usageMeterId: z.string(), // Required for Usage prices - replaces productId
    trialPeriodDays: z.never().optional(), // Usage prices don't have trial periods
  })

const setupPriceInputSchema = z.discriminatedUnion('type', [
  setupSinglePaymentPriceSchema,
  setupSubscriptionPriceSchema,
  setupUsagePriceSchema,
])

/**
 * This schema is used to validate the input for the setupPrice function.
 *
 * prices.ts currently has a schema called pricesInsertSchema, which is similar to this but more permissive.
 * We should consider making that schema more strict and using it here instead of creating this one.
 */

type SetupPriceInput = z.infer<typeof setupPriceInputSchema>

export const setupPrice = async (
  input: SetupPriceInput
): Promise<Price.Record> => {
  // Validate input to catch test data errors early
  const validatedInput = setupPriceInputSchema.parse(input)

  const {
    name,
    type,
    unitPrice,
    livemode,
    isDefault,
    currency,
    externalId,
    active = true,
    slug,
  } = validatedInput

  const intervalUnit =
    type !== PriceType.SinglePayment
      ? validatedInput.intervalUnit
      : undefined
  const intervalCount =
    type !== PriceType.SinglePayment
      ? validatedInput.intervalCount
      : undefined
  const trialPeriodDays =
    type === PriceType.Subscription
      ? validatedInput.trialPeriodDays
      : undefined
  const usageMeterId =
    type === PriceType.Usage ? validatedInput.usageMeterId : undefined
  // productId only exists for non-usage prices
  const productId =
    type !== PriceType.Usage ? validatedInput.productId : null

  return adminTransaction(async ({ transaction }) => {
    // For usage prices, derive pricingModelId from usage meter
    const pricingModelId =
      type === PriceType.Usage && usageMeterId
        ? await derivePricingModelIdFromUsageMeter(
            usageMeterId,
            transaction
          )
        : undefined

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
        trialPeriodDays: null,
        usageMeterId,
        usageEventsPerUnit: 1,
        pricingModelId, // Derived from usage meter
      },
      [PriceType.Subscription]: {
        name,
        intervalUnit,
        intervalCount,
        trialPeriodDays: trialPeriodDays ?? null,
        usageEventsPerUnit: null,
      },
    }
    if (type === PriceType.Usage && !usageMeterId) {
      throw new Error('Usage price must have a usage meter')
    }
    switch (type) {
      case PriceType.SinglePayment:
        return safelyInsertPrice(
          {
            ...basePrice,
            ...priceConfig[PriceType.SinglePayment],
            type: PriceType.SinglePayment,
          },
          transaction
        )
      case PriceType.Subscription:
        return safelyInsertPrice(
          {
            ...basePrice,
            ...priceConfig[PriceType.Subscription],
            type: PriceType.Subscription,
            intervalUnit: intervalUnit ?? IntervalUnit.Month,
            intervalCount: intervalCount ?? 1,
          },
          transaction
        )
      case PriceType.Usage:
        // Use insertPrice for usage prices to respect isDefault and active flags
        // safelyInsertPrice always sets isDefault: false for usage prices
        return insertPrice(
          {
            ...basePrice,
            ...priceConfig[PriceType.Usage],
            usageMeterId: usageMeterId!,
            productId: null, // Usage prices don't have products
            type: PriceType.Usage,
            intervalUnit: intervalUnit ?? IntervalUnit.Month,
            intervalCount: intervalCount ?? 1,
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
  stripeTaxTransactionId,
  stripeTaxCalculationId,
  taxAmount,
  subtotal,
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
  refundedAt?: number
  chargeDate?: number
  purchaseId?: string
  paymentMethodId?: string
  stripeTaxTransactionId?: string | null
  stripeTaxCalculationId?: string | null
  taxAmount?: number
  subtotal?: number
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
        chargeDate: chargeDate ?? Date.now(),
        taxCountry: CountryCode.US,
        subscriptionId: subscriptionId ?? null,
        purchaseId: purchaseId ?? null,
        refunded,
        refundedAmount,
        refundedAt,
        paymentMethodId,
        stripeTaxTransactionId: stripeTaxTransactionId ?? null,
        stripeTaxCalculationId: stripeTaxCalculationId ?? null,
        taxAmount: taxAmount ?? 0,
        subtotal: subtotal ?? amount,
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
  addedDate?: number
  removedDate?: number
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
    if (type !== SubscriptionItemType.Static) {
      throw new Error('Subscription item type must be static')
    }

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
      addedDate: addedDate ?? Date.now(),
      expiredAt: null,
      metadata: metadata ?? {},
      externalId: null,
      type: SubscriptionItemType.Static,
    }
    return insertSubscriptionItem(insert, transaction)
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
  invoiceId,
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
  invoiceId?: string
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
  pricingModelId,
  name,
  amount,
  amountType = DiscountAmountType.Percent,
  livemode = true,
  code,
}: {
  organizationId: string
  pricingModelId: string
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
        pricingModelId,
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
  aggregationType,
}: {
  organizationId: string
  name: string
  livemode?: boolean
  pricingModelId?: string
  slug?: string
  aggregationType?: UsageMeterAggregationType
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
        ...(aggregationType && { aggregationType }),
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
      {
        subscriptionId,
        usageMeterId,
        livemode,
        organizationId,
        normalBalance: NormalBalanceType.CREDIT,
        version: 0,
      },
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
        usageDate: params.usageDate ?? Date.now(),
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
  entryTimestamp?: number
  status?: LedgerEntryStatus
  livemode?: boolean
  metadata?: Record<string, any> | null
  discardedAt?: number | null
  expiredAt?: number | null
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
  const now = Date.now()
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
  discardedAt?: number | null
}
// --- Credit Ledger Entry Setup ---
interface SetupCreditCreditGrantRecognizedParams
  extends SetupLedgerEntryCoreParams {
  entryType: LedgerEntryType.CreditGrantRecognized
  sourceUsageCreditId: string
  expiresAt?: number | null
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
        issuedAt: params.issuedAt ?? now.getTime(),
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
        appliedAt: now.getTime(),
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
    amountAdjusted: number
    usageMeterId: string
    reason: string
  }
): Promise<UsageCreditBalanceAdjustment.Record> => {
  return adminTransaction(async ({ transaction }) => {
    return insertUsageCreditBalanceAdjustment(
      {
        livemode: true,
        adjustmentInitiatedAt: Date.now(),
        adjustedByUserId: null,
        notes: 'Test Usage Credit Balance Adjustment',
        ...params,
      } as UsageCreditBalanceAdjustment.Insert,
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
        refundProcessedAt: Date.now(),
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
    expiredAt?: number | null
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
        manuallyCreated: params.manuallyCreated ?? false,
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
): Promise<SubscriptionItemFeature.UsageCreditGrantRecord> => {
  return adminTransaction(async ({ transaction }) => {
    const result = await insertSubscriptionItemFeature(
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
    if (result.type !== FeatureType.UsageCreditGrant) {
      throw new Error('Expected UsageCreditGrant feature')
    }
    return result
  })
}

export const setupResourceSubscriptionItemFeature = async (
  params: Partial<SubscriptionItemFeature.ResourceInsert> & {
    subscriptionItemId: string
    featureId: string
    resourceId: string
    pricingModelId: string
  }
): Promise<SubscriptionItemFeature.ResourceRecord> => {
  return adminTransaction(async ({ transaction }) => {
    const result = await insertSubscriptionItemFeature(
      {
        livemode: true,
        type: FeatureType.Resource,
        amount: params.amount ?? 5,
        renewalFrequency: null,
        usageMeterId: null,
        productFeatureId: params.productFeatureId ?? null,
        ...params,
      },
      transaction
    )
    if (result.type !== FeatureType.Resource) {
      throw new Error('Expected Resource feature')
    }
    return result
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
  // Build price params for Usage type, excluding incompatible fields from priceArgs
  // Usage prices don't have productId - they belong to usage meters
  const { trialPeriodDays: _, ...compatiblePriceArgs } =
    params.priceArgs ?? {}
  const price = await setupPrice({
    name: 'Test Price',
    unitPrice: 1000,
    livemode,
    isDefault: false,
    ...compatiblePriceArgs,
    // Override type-specific fields after spreading priceArgs
    type: PriceType.Usage,
    intervalUnit: IntervalUnit.Month,
    intervalCount: 1,
    usageMeterId: usageMeter.id,
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
    // type: SubscriptionItemType.Usage,
    // usageMeterId: usageMeter.id,
    // usageEventsPerUnit: 1,
    ...(params.subscriptionItemArgs ?? {}),
  })
  const billingPeriod = await setupBillingPeriod({
    subscriptionId: subscription.id,
    startDate: subscription.currentBillingPeriodStart ?? Date.now(),
    endDate:
      subscription.currentBillingPeriodEnd ??
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).getTime(),
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

export const setupResource = async (params: {
  organizationId: string
  pricingModelId: string
  slug?: string
  name?: string
  description?: string
  active?: boolean
}) => {
  return adminTransaction(async ({ transaction }) => {
    return insertResource(
      {
        organizationId: params.organizationId,
        pricingModelId: params.pricingModelId,
        slug: params.slug ?? `resource-${core.nanoid()}`,
        name: params.name ?? 'Seats',
        livemode: true,
        active: params.active ?? true,
      },
      transaction
    )
  })
}

export const setupResourceClaim = async (params: {
  organizationId: string
  resourceId: string
  subscriptionId: string
  pricingModelId: string
  externalId?: string | null
  metadata?: Record<string, string | number | boolean> | null
  expiredAt?: number | null
}) => {
  return adminTransaction(async ({ transaction }) => {
    return insertResourceClaim(
      {
        organizationId: params.organizationId,
        resourceId: params.resourceId,
        subscriptionId: params.subscriptionId,
        pricingModelId: params.pricingModelId,
        externalId: params.externalId ?? null,
        metadata: params.metadata ?? null,
        expiredAt: params.expiredAt ?? null,
        livemode: true,
      },
      transaction
    )
  })
}

export const setupResourceFeature = async (
  params: Partial<Omit<Feature.ResourceInsert, 'type'>> & {
    organizationId: string
    name: string
    resourceId: string
    livemode: boolean
  }
): Promise<Feature.ResourceRecord> => {
  return adminTransaction(async ({ transaction }) => {
    const resolvedPricingModelId =
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
    if (!resolvedPricingModelId) {
      throw new Error(
        'setupResourceFeature: No pricingModelId provided and no default pricing model found'
      )
    }
    const { resourceId, pricingModelId: _, ...restParams } = params
    const insert: Feature.ResourceInsert = {
      ...restParams,
      type: FeatureType.Resource,
      description: params.description ?? '',
      slug: params.slug ?? `resource-feature-${core.nanoid()}`,
      amount: params.amount ?? 5,
      usageMeterId: null,
      renewalFrequency: null,
      pricingModelId: resolvedPricingModelId,
      resourceId,
    }
    return insertFeature(
      insert,
      transaction
    ) as Promise<Feature.ResourceRecord>
  })
}
