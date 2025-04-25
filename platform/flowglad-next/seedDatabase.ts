import db from '@/db/client'
import { adminTransaction } from '@/db/adminTransaction'
import { countries } from '@/db/schema/countries'
import { insertCustomer } from '@/db/tableMethods/customerMethods'
import { insertOrganization } from '@/db/tableMethods/organizationMethods'
import { insertProduct } from '@/db/tableMethods/productMethods'
import {
  insertSubscription,
  selectSubscriptionById,
} from '@/db/tableMethods/subscriptionMethods'
import {
  insertPrice,
  selectPriceById,
} from '@/db/tableMethods/priceMethods'
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
  DiscountAmountType,
  DiscountDuration,
  FeeCalculationType,
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
import { insertCatalog } from '@/db/tableMethods/catalogMethods'
import { insertCheckoutSession } from '@/db/tableMethods/checkoutSessionMethods'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import { BillingAddress } from '@/db/schema/organizations'
import { insertDiscount } from '@/db/tableMethods/discountMethods'
import { insertFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'

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
        code: 'US',
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
  livemode?: boolean
}) => {
  return adminTransaction(async ({ transaction }) => {
    const email = `test+${core.nanoid()}@test.com`
    return insertCustomer(
      {
        organizationId: params.organizationId,
        email,
        name: email,
        externalId: core.nanoid(),
        livemode: params.livemode ?? true,
        stripeCustomerId:
          params.stripeCustomerId ?? `cus_${core.nanoid()}`,
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
        refunded: false,
        refundedAt: null,
        refundedAmount: 0,
        taxCountry: CountryCode.US,
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
}: {
  organizationId: string
  customerId: string
  priceId: string
  status: CheckoutSessionStatus
  type: CheckoutSessionType
  quantity: number
  livemode: boolean
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
      targetSubscriptionId: 'test',
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
