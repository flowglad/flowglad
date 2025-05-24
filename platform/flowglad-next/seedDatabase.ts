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
import { apiKeys } from '@/db/schema/apiKeys'
import { insertBillingPeriod } from '@/db/tableMethods/billingPeriodMethods'
import { insertBillingRun } from '@/db/tableMethods/billingRunMethods'
import { insertBillingPeriodItem } from '@/db/tableMethods/billingPeriodItemMethods'
import { insertInvoice } from '@/db/tableMethods/invoiceMethods'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'
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
} from '@/types'
import { core } from '@/utils/core'
import { sql } from 'drizzle-orm'
import { selectCountries } from '@/db/tableMethods/countryMethods'
import { insertPayment } from '@/db/tableMethods/paymentMethods'
import { BillingRun } from '@/db/schema/billingRuns'
import { insertUser } from '@/db/tableMethods/userMethods'
import { insertMembership } from '@/db/tableMethods/membershipMethods'
import { insertSubscriptionItem } from '@/db/tableMethods/subscriptionItemMethods'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { insertPurchase } from '@/db/tableMethods/purchaseMethods'
import { Price } from '@/db/schema/prices'
import { Purchase } from '@/db/schema/purchases'
import { projectPriceFieldsOntoPurchaseFields } from '@/utils/purchaseHelpers'
import { insertInvoiceLineItem } from '@/db/tableMethods/invoiceLineItemMethods'
import { Payment } from '@/db/schema/payments'
import { safelyInsertPaymentMethod } from '@/db/tableMethods/paymentMethodMethods'
import {
  insertCatalog,
  selectDefaultCatalog,
} from '@/db/tableMethods/catalogMethods'
import { insertCheckoutSession } from '@/db/tableMethods/checkoutSessionMethods'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import { BillingAddress } from '@/db/schema/organizations'
import { insertDiscount } from '@/db/tableMethods/discountMethods'
import { insertFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { insertUsageMeter } from '@/db/tableMethods/usageMeterMethods'
import { insertProductFeature } from '@/db/tableMethods/productFeatureMethods'
import { insertFeature } from '@/db/tableMethods/featureMethods'
import { selectCatalogById } from '@/db/tableMethods/catalogMethods'
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

export const setupOrg = async () => {
  await insertCountries()
  return adminTransaction(async ({ transaction }) => {
    const [country] = await selectCountries({}, transaction)
    const organization = await insertOrganization(
      {
        name: `Flowglad Test ${core.nanoid()}`,
        countryId: country.id,
        defaultCurrency: CurrencyCode.USD,
      },
      transaction
    )
    const catalog = await insertCatalog(
      {
        name: 'Flowglad Test Catalog',
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
        catalogId: catalog.id,
        externalId: null,
      },
      transaction
    )

    const price = await insertPrice(
      {
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
        usageMeterId: null,
      },
      transaction
    )
    return { organization, product, price, catalog }
  })
}

export const setupProduct = async ({
  organizationId,
  name,
  livemode,
  catalogId,
  active = true,
}: {
  organizationId: string
  name: string
  livemode?: boolean
  catalogId: string
  active?: boolean
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
        catalogId,
        externalId: null,
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

export const setupCustomer = async (params: {
  organizationId: string
  stripeCustomerId?: string
  invoiceNumberBase?: string
  email?: string
  livemode?: boolean
}) => {
  return adminTransaction(async ({ transaction }) => {
    const email = params.email ?? `test+${core.nanoid()}@test.com`
    return insertCustomer(
      {
        organizationId: params.organizationId,
        email,
        name: email,
        externalId: core.nanoid(),
        livemode: params.livemode ?? true,
        stripeCustomerId:
          params.stripeCustomerId ?? `cus_${core.nanoid()}`,
        invoiceNumberBase: params.invoiceNumberBase ?? core.nanoid(),
      },
      transaction
    )
  })
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
  paymentMethodId: string
  priceId: string
  interval?: IntervalUnit
  intervalCount?: number
  livemode?: boolean
  currentBillingPeriodEnd?: Date
  currentBillingPeriodStart?: Date
  status?: SubscriptionStatus
  trialEnd?: Date
  startDate?: Date
}) => {
  return adminTransaction(async ({ transaction }) => {
    const price = await selectPriceById(params.priceId, transaction)
    return insertSubscription(
      {
        organizationId: params.organizationId,
        customerId: params.customerId,
        defaultPaymentMethodId: params.paymentMethodId,
        status: params.status ?? SubscriptionStatus.Active,
        livemode: params.livemode ?? true,
        billingCycleAnchorDate: new Date(),
        currentBillingPeriodEnd:
          params.currentBillingPeriodEnd ??
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        currentBillingPeriodStart:
          params.currentBillingPeriodStart ?? new Date(),
        canceledAt: null,
        cancelScheduledAt: null,
        trialEnd: params.trialEnd ?? null,
        backupPaymentMethodId: null,
        priceId: params.priceId,
        interval: params.interval ?? IntervalUnit.Month,
        intervalCount: params.intervalCount ?? 1,
        metadata: {},
        stripeSetupIntentId: `setupintent_${core.nanoid()}`,
        name: null,
        runBillingAtPeriodStart:
          price.type === PriceType.Subscription ? true : false,
        externalId: null,
        startDate: params.startDate ?? new Date(),
      },
      transaction
    )
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

export const setupBillingPeriodItems = async ({
  billingPeriodId,
  quantity,
  unitPrice,
  name = 'Test Item',
  description = 'Test Description',
  livemode = true,
}: {
  billingPeriodId: string
  quantity: number
  unitPrice: number
  name?: string
  description?: string
  livemode?: boolean
}) => {
  return adminTransaction(async ({ transaction }) => {
    const item = await insertBillingPeriodItem(
      {
        billingPeriodId,
        quantity,
        unitPrice,
        name,
        description,
        livemode,
      },
      transaction
    )
    return [item]
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
    return insertPurchase(
      {
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
}: {
  billingPeriodId?: string
  customerId: string
  organizationId: string
  status?: InvoiceStatus
  livemode?: boolean
  type?: InvoiceType
  priceId: string
}) => {
  return adminTransaction(async ({ transaction }) => {
    let billingPeriod: BillingPeriod.Record | null = null
    let purchaseId: string | null = null
    if (billingPeriodId) {
      billingPeriod = await selectBillingPeriodById(
        billingPeriodId,
        transaction
      )
    } else {
      const purchase = await setupPurchase({
        customerId,
        organizationId,
        livemode,
        priceId,
      })
      purchaseId = purchase.id
    }

    const invoice = await insertInvoice(
      // @ts-expect-error
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
        purchaseId,
        currency: CurrencyCode.USD,
        taxCountry: CountryCode.US,
        subscriptionId: billingPeriod?.subscriptionId ?? null,
      },
      transaction
    )
    await insertInvoiceLineItem(
      {
        invoiceId: invoice.id,
        description: 'Test Description',
        price: 1000,
        quantity: 1,
        livemode: invoice.livemode,
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
}: {
  productId: string
  name: string
  type: PriceType
  unitPrice: number
  intervalUnit: IntervalUnit
  intervalCount: number
  livemode: boolean
  isDefault: boolean
  setupFeeAmount: number
  usageMeterId?: string
  currency?: CurrencyCode
  externalId?: string
  trialPeriodDays?: number
  active?: boolean
}) => {
  return adminTransaction(async ({ transaction }) => {
    if (type === PriceType.SinglePayment) {
      return insertPrice(
        {
          productId,
          name: `${name} (Single Payment)`,
          type,
          unitPrice,
          currency: CurrencyCode.USD,
          externalId: externalId ?? core.nanoid(),
          active,
          usageMeterId: null,
          intervalUnit: null,
          intervalCount: null,
          livemode,
          isDefault,
          setupFeeAmount: null,
          trialPeriodDays: null,
        },
        transaction
      )
    }
    return insertPrice(
      {
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
        externalId: externalId ?? core.nanoid(),
        usageMeterId: usageMeterId ?? null,
        active,
      } as Price.Insert,
      transaction
    )
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
        chargeDate: new Date(),
        taxCountry: CountryCode.US,
        subscriptionId: subscriptionId ?? null,
        refunded,
        refundedAmount,
        refundedAt,
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
}: {
  subscriptionId: string
  name: string
  quantity: number
  unitPrice: number
  priceId?: string
  addedDate?: Date
  removedDate?: Date
  metadata?: Record<string, any>
}) => {
  return adminTransaction(async ({ transaction }) => {
    const subscription = await selectSubscriptionById(
      subscriptionId,
      transaction
    )
    if (!subscription) {
      throw new Error('Subscription not found')
    }
    return insertSubscriptionItem(
      {
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
      },
      transaction
    )
  })
}

export const setupCatalog = async ({
  organizationId,
  name = 'Test Catalog',
  livemode = true,
  isDefault = false,
}: {
  organizationId: string
  name?: string
  livemode?: boolean
  isDefault?: boolean
}) => {
  return adminTransaction(async ({ transaction }) => {
    return insertCatalog(
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
}: {
  organizationId: string
  customerId: string
  priceId: string
  status: CheckoutSessionStatus
  type: CheckoutSessionType
  quantity: number
  livemode: boolean
  targetSubscriptionId?: string
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
  }
  const addPaymentMethodCheckoutSessionInsert: CheckoutSession.AddPaymentMethodInsert =
    {
      ...coreFields,
      priceId,
      status: CheckoutSessionStatus.Open,
      type: CheckoutSessionType.AddPaymentMethod,
      livemode,
      quantity: 1,
      targetSubscriptionId: targetSubscriptionId ?? null,
      outputName: null,
      outputMetadata: {},
    }
  const productCheckoutSessionInsert: CheckoutSession.ProductInsert =
    {
      ...coreFields,
      priceId,
      status: CheckoutSessionStatus.Open,
      type: CheckoutSessionType.Product,
      quantity,
      livemode,
      targetSubscriptionId: null,
      outputName: null,
      invoiceId: null,
      outputMetadata: {},
    }
  const purchaseCheckoutSessionInsert: CheckoutSession.PurchaseInsert =
    {
      ...coreFields,
      priceId,
      status: CheckoutSessionStatus.Open,
      type: CheckoutSessionType.Purchase,
      quantity,
      livemode,
      targetSubscriptionId: null,
      outputName: null,
      outputMetadata: {},
      purchaseId: 'test',
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
      status: CheckoutSessionStatus.Open,
      type: CheckoutSessionType.Invoice,
      quantity,
      livemode,
      targetSubscriptionId: null,
      outputName: null,
      invoiceId: invoice.id,
      purchaseId: null,
      outputMetadata: null,
    }
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
}: {
  invoiceId: string
  priceId: string
  quantity?: number
  price?: number
  livemode?: boolean
}) => {
  return adminTransaction(async ({ transaction }) => {
    return insertInvoiceLineItem(
      {
        invoiceId,
        priceId,
        quantity,
        price,
        livemode,
        description: 'Test Description',
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
  catalogId,
}: {
  organizationId: string
  name: string
  livemode?: boolean
  catalogId?: string
}) => {
  return adminTransaction(async ({ transaction }) => {
    let catalogToUseId: string | null = null
    if (catalogId) {
      const catalog = await selectCatalogById(catalogId, transaction)
      if (!catalog) {
        throw new Error('Catalog not found')
      }
      catalogToUseId = catalog.id
    } else {
      const defaultCatalog = await selectDefaultCatalog(
        { organizationId, livemode },
        transaction
      )
      if (!defaultCatalog) {
        throw new Error('Default catalog not found')
      }
      catalogToUseId = defaultCatalog.id
    }
    if (!catalogToUseId) {
      throw new Error('setupUsageMeter: Catalog not found')
    }
    return insertUsageMeter(
      { organizationId, name, livemode, catalogId: catalogToUseId },
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
    const apiKey = apiKeyInsertResult as typeof apiKeys.$inferSelect

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
          catalogId: product.catalogId,
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
        }
      } else if (spec.type === FeatureType.Toggle) {
        featureInsertData = {
          ...baseFeatureInsertData,
          type: FeatureType.Toggle,
          amount: null,
          renewalFrequency: null,
          usageMeterId: null,
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
    billingPeriodId: string
    transactionId: string
    customerId: string
  }
): Promise<UsageEvent.Record> => {
  return adminTransaction(async ({ transaction }) => {
    return insertUsageEvent(
      {
        livemode: true,
        usageDate: params.usageDate,
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
  usageMeterId?: string | null
  calculationRunId?: string | null
  appliedToLedgerItemId?: string | null
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

export type DebitLedgerEntrySetupParams =
  | SetupDebitUsageCostParams
  | SetupDebitCreditGrantExpiredParams
  | SetupDebitPaymentRefundedParams
  | SetupDebitCreditBalanceAdjustedParams
  | SetupDebitBillingAdjustmentParams

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
    usageMeterId: params.usageMeterId ?? null,
    calculationRunId: params.calculationRunId ?? null,
    appliedToLedgerItemId: params.appliedToLedgerItemId ?? null,
    amount: dbAmount,
  }
}

const debitEntryInsertFromDebigLedgerParams = (
  params: DebitLedgerEntrySetupParams & CoreLedgerEntryUserParams
) => {
  const baseProps = {
    ...baseLedgerEntryInsertFieldsFromParams(params),
    direction: LedgerEntryDirection.Debit,
  } as const

  let insertData: LedgerEntry.Insert

  switch (params.entryType) {
    case LedgerEntryType.UsageCost:
      insertData = {
        ...baseProps,
        entryType: params.entryType,
        sourceUsageEventId: params.sourceUsageEventId,
      } satisfies LedgerEntry.UsageCostInsert
      break

    case LedgerEntryType.CreditGrantExpired:
      insertData = {
        ...baseProps,
        entryType: params.entryType,
        sourceUsageCreditId: params.sourceUsageCreditId,
      } satisfies LedgerEntry.CreditGrantExpiredInsert
      break

    case LedgerEntryType.PaymentRefunded:
      insertData = {
        ...baseProps,
        entryType: params.entryType,
        sourceRefundId: params.sourceRefundId,
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

export type CreditLedgerEntrySetupParams =
  | SetupCreditCreditGrantRecognizedParams
  | SetupCreditCreditBalanceAdjustedParams
  | SetupCreditBillingAdjustmentParams

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
): Promise<typeof usageCredits.$inferSelect> => {
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
  }
): Promise<typeof usageCreditApplications.$inferSelect> => {
  return adminTransaction(async ({ transaction }) => {
    const now = new Date()
    return insertUsageCreditApplication(
      {
        livemode: true,
        appliedAt: now,
        calculationRunId: `calc_run_${core.nanoid()}`,
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

type QuickEntries =
  | CreditLedgerEntrySetupParams
  | DebitLedgerEntrySetupParams

type CreditLedgerEntryType =
  | LedgerEntryType.CreditGrantRecognized
  | LedgerEntryType.CreditBalanceAdjusted
  | LedgerEntryType.BillingAdjustment

type DebitLedgerEntryType =
  | LedgerEntryType.UsageCost
  | LedgerEntryType.CreditGrantExpired
  | LedgerEntryType.PaymentRefunded
  | LedgerEntryType.CreditBalanceAdjusted
  | LedgerEntryType.BillingAdjustment

const debitableEntryTypes = [
  LedgerEntryType.UsageCost,
  LedgerEntryType.CreditGrantExpired,
  LedgerEntryType.PaymentRefunded,
  LedgerEntryType.CreditBalanceAdjusted,
  LedgerEntryType.BillingAdjustment,
] as const

const creditableEntryTypes = [
  LedgerEntryType.CreditGrantRecognized,
  LedgerEntryType.CreditBalanceAdjusted,
  LedgerEntryType.BillingAdjustment,
] as const

export const setupLedgerEntries = async (params: {
  organizationId: string
  subscriptionId: string
  ledgerTransactionId: string
  ledgerAccountId: string
  entries: QuickEntries[]
}) => {
  await adminTransaction(async ({ transaction }) => {
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
