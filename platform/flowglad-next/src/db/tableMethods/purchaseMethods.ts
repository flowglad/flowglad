import { and, eq, exists, ilike, inArray, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  type Purchase,
  purchaseClientInsertSchema,
  purchases,
  purchasesInsertSchema,
  purchasesSelectSchema,
  purchasesTableRowDataSchema,
  purchasesUpdateSchema,
  singlePaymentPurchaseSelectSchema,
  subscriptionPurchaseSelectSchema,
} from '@/db/schema/purchases'
import {
  createCursorPaginatedSelectFunction,
  createDerivePricingModelId,
  createDerivePricingModelIds,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  createUpsertFunction,
  type ORMMethodCreatorConfig,
  whereClauseFromObject,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'
import {
  CheckoutFlowType,
  CurrencyCode,
  PaymentStatus,
  PriceType,
  PurchaseStatus,
} from '@/types'
import { CacheDependency, cached } from '@/utils/cache'
import { RedisKeyNamespace } from '@/utils/redis'
import { checkoutSessionClientSelectSchema } from '../schema/checkoutSessions'
import {
  customerClientInsertSchema,
  customers,
  customersSelectSchema,
} from '../schema/customers'
import { discountClientSelectSchema } from '../schema/discounts'
import { featuresClientSelectSchema } from '../schema/features'
import { customerFacingFeeCalculationSelectSchema } from '../schema/feeCalculations'
import { invoiceLineItemsClientSelectSchema } from '../schema/invoiceLineItems'
import { invoicesClientSelectSchema } from '../schema/invoices'
import {
  organizations,
  organizationsSelectSchema,
} from '../schema/organizations'
import { payments, paymentsSelectSchema } from '../schema/payments'
import {
  Price,
  prices,
  pricesSelectSchema,
  singlePaymentPriceSelectSchema,
  subscriptionPriceSelectSchema,
  usagePriceSelectSchema,
} from '../schema/prices'
import {
  Product,
  products,
  productsSelectSchema,
} from '../schema/products'
import {
  derivePricingModelIdFromPrice,
  pricingModelIdsForPrices,
} from './priceMethods'

const config: ORMMethodCreatorConfig<
  typeof purchases,
  typeof purchasesSelectSchema,
  typeof purchasesInsertSchema,
  typeof purchasesUpdateSchema
> = {
  selectSchema: purchasesSelectSchema,
  insertSchema: purchasesInsertSchema,
  updateSchema: purchasesUpdateSchema,
  tableName: 'purchases',
}

export const selectPurchaseById = createSelectById(purchases, config)

export const selectPurchases = createSelectFunction(purchases, config)

/**
 * Selects purchases by customer ID with caching enabled by default.
 * Pass { ignoreCache: true } as the last argument to bypass the cache.
 *
 * This cache entry depends on customerPurchases - invalidate when
 * purchases for this customer are created or updated.
 *
 * Cache key includes livemode to prevent cross-mode data leakage, since RLS
 * filters purchases by livemode and the same customer could have different
 * purchases in live vs test mode.
 */
export const selectPurchasesByCustomerId = cached(
  {
    namespace: RedisKeyNamespace.PurchasesByCustomer,
    keyFn: (
      customerId: string,
      _transaction: DbTransaction,
      livemode: boolean
    ) => `${customerId}:${livemode}`,
    schema: purchasesSelectSchema.array(),
    dependenciesFn: (purchases, customerId: string) => [
      // Set membership: invalidate when purchases are added/removed for this customer
      CacheDependency.customerPurchases(customerId),
      // Content: invalidate when any purchase's properties change
      ...purchases.map((p) => CacheDependency.purchase(p.id)),
    ],
  },
  async (
    customerId: string,
    transaction: DbTransaction,
    // livemode is used by keyFn for cache key generation, not in the query itself
    // (RLS filters by livemode context set on the transaction)
    _livemode: boolean
  ) => {
    return selectPurchases({ customerId }, transaction)
  }
)

const baseInsertPurchase = createInsertFunction(purchases, config)

export const insertPurchase = async (
  purchaseInsert: Purchase.Insert,
  transaction: DbTransaction
): Promise<Purchase.Record> => {
  const pricingModelId = purchaseInsert.pricingModelId
    ? purchaseInsert.pricingModelId
    : await derivePricingModelIdFromPrice(
        purchaseInsert.priceId,
        transaction
      )
  return baseInsertPurchase(
    {
      ...purchaseInsert,
      pricingModelId,
    },
    transaction
  )
}

const baseUpsertPurchaseById = createUpsertFunction(
  purchases,
  purchases.id,
  config
)

export const upsertPurchaseById = async (
  purchaseInsert: Purchase.Insert & { id?: string },
  transaction: DbTransaction
): Promise<Purchase.Record> => {
  const pricingModelId = purchaseInsert.pricingModelId
    ? purchaseInsert.pricingModelId
    : await derivePricingModelIdFromPrice(
        purchaseInsert.priceId,
        transaction
      )
  const results = await baseUpsertPurchaseById(
    {
      ...purchaseInsert,
      pricingModelId,
    },
    transaction
  )
  return results[0]! // Upsert functions return arrays
}

export const updatePurchase = createUpdateFunction(purchases, config)

/**
 * Derives pricingModelId from a purchase (via price).
 * Used for discountRedemptions.
 */
export const derivePricingModelIdFromPurchase =
  createDerivePricingModelId(purchases, config, selectPurchaseById)

/**
 * Batch fetch pricingModelIds for multiple purchases.
 * More efficient than calling derivePricingModelIdFromPurchase for each purchase individually.
 * Used by bulk insert operations in discount redemptions.
 */
export const pricingModelIdsForPurchases =
  createDerivePricingModelIds(purchases, config)

export const selectPurchasesForCustomer = (
  customerId: string,
  transaction: DbTransaction
) => {
  return transaction
    .select()
    .from(purchases)
    .where(and(eq(purchases.customerId, customerId)))
}

export const selectPurchasesAndAssociatedPaymentsByPurchaseWhere =
  async (
    selectConditions: Partial<Purchase.Record>,
    transaction: DbTransaction
  ) => {
    const result = await transaction
      .select({
        purchase: purchases,
        payment: payments,
      })
      .from(purchases)
      .innerJoin(payments, eq(payments.purchaseId, purchases.id))
      .where(whereClauseFromObject(purchases, selectConditions))
    return result.map((item) => {
      return {
        purchase: purchasesSelectSchema.parse(item.purchase),
        payment: paymentsSelectSchema.parse(item.payment),
      }
    })
  }

export const selectPurchaseAndCustomersByPurchaseWhere = async (
  selectConditions: Partial<Purchase.Record>,
  transaction: DbTransaction
) => {
  const result = await transaction
    .select({
      purchase: purchases,
      customer: customers,
    })
    .from(purchases)
    .innerJoin(customers, eq(customers.id, purchases.customerId))
    .where(whereClauseFromObject(purchases, selectConditions))
  return result.map((item) => {
    return {
      purchase: purchasesSelectSchema.parse(item.purchase),
      customer: customersSelectSchema.parse(item.customer),
    }
  })
}

export const selectPurchaseCheckoutParametersById = async (
  id: string,
  transaction: DbTransaction
) => {
  const [result] = await transaction
    .select({
      purchase: purchases,
      price: prices,
      customer: customers,
      organization: organizations,
      product: products,
    })
    .from(purchases)
    .innerJoin(prices, eq(purchases.priceId, prices.id))
    .innerJoin(customers, eq(customers.id, purchases.customerId))
    .innerJoin(
      organizations,
      eq(organizations.id, customers.organizationId)
    )
    .innerJoin(products, eq(products.id, prices.productId))
    .where(and(eq(purchases.id, id)))
  return {
    purchase: purchasesSelectSchema.parse(result.purchase),
    price: pricesSelectSchema.parse(result.price),
    product: productsSelectSchema.parse(result.product),
    customer: customersSelectSchema.parse(result.customer),
    organization: organizationsSelectSchema.parse(
      result.organization
    ),
  }
}

const checkoutInfoCoreSchema = z.object({
  checkoutSession: checkoutSessionClientSelectSchema,
  /**
   * Only present for open purchases
   */
  customer: customersSelectSchema.nullish(),
  sellerOrganization: organizationsSelectSchema,
  redirectUrl: z.string().url(),
  cancelUrl: z.string().url().nullish(),
  clientSecret: z.string().nullable(),
  customerSessionClientSecret: z.string().nullable(),
  discount: discountClientSelectSchema.nullish(),
  /**
   * Only present when checkoutSession.customerId is not null
   */
  readonlyCustomerEmail: z.string().email().nullish(),
  feeCalculation: customerFacingFeeCalculationSelectSchema.nullable(),
  /**
   * Whether the customer is eligible for a trial period.
   * This only checks customer eligibility (whether they've used a trial before),
   * not whether the price has a trial period (that's in price.trialPeriodDays).
   * true = customer hasn't used a trial before (or anonymous customer)
   * false = customer has used a trial before
   * undefined = not applicable (not subscription/usage price)
   */
  isEligibleForTrial: z.boolean().optional(),
})

const subscriptionCheckoutInfoSchema = checkoutInfoCoreSchema.extend({
  purchase: subscriptionPurchaseSelectSchema.nullish(),
  price: z.discriminatedUnion('type', [
    subscriptionPriceSelectSchema,
    usagePriceSelectSchema,
  ]),
  features: featuresClientSelectSchema.array().optional(),
  flowType: z.literal(CheckoutFlowType.Subscription),
  product: productsSelectSchema,
})

const addPaymentMethodCheckoutInfoSchema =
  checkoutInfoCoreSchema.extend({
    flowType: z.literal(CheckoutFlowType.AddPaymentMethod),
  })

export type SubscriptionCheckoutInfoCore = z.infer<
  typeof subscriptionCheckoutInfoSchema
>

const singlePaymentCheckoutInfoSchema = checkoutInfoCoreSchema.extend(
  {
    purchase: singlePaymentPurchaseSelectSchema.nullish(),
    price: singlePaymentPriceSelectSchema,
    features: featuresClientSelectSchema.array().optional(),
    flowType: z.literal(CheckoutFlowType.SinglePayment),
    product: productsSelectSchema,
  }
)

export type SinglePaymentCheckoutInfoCore = z.infer<
  typeof singlePaymentCheckoutInfoSchema
>

const invoiceCheckoutInfoSchema = checkoutInfoCoreSchema.extend({
  invoice: invoicesClientSelectSchema,
  invoiceLineItems: invoiceLineItemsClientSelectSchema.array(),
  flowType: z.literal(CheckoutFlowType.Invoice),
})

export const checkoutInfoSchema = z.discriminatedUnion('flowType', [
  subscriptionCheckoutInfoSchema,
  singlePaymentCheckoutInfoSchema,
  invoiceCheckoutInfoSchema,
  addPaymentMethodCheckoutInfoSchema,
])

export type CheckoutInfoCore = z.infer<typeof checkoutInfoSchema>

export const createCustomerInputSchema = z.object({
  customer: customerClientInsertSchema,
})

export type CreateCustomerInputSchema = z.infer<
  typeof createCustomerInputSchema
>

export const bulkInsertPurchases = async (
  purchaseInserts: Purchase.Insert[],
  transaction: DbTransaction
) => {
  const pricingModelIdMap = await pricingModelIdsForPrices(
    purchaseInserts.map((insert) => insert.priceId),
    transaction
  )
  const purchasesWithPricingModelId = purchaseInserts.map(
    (purchaseInsert) => {
      const pricingModelId =
        purchaseInsert.pricingModelId ??
        pricingModelIdMap.get(purchaseInsert.priceId)
      if (!pricingModelId) {
        throw new Error(
          `Pricing model id not found for price ${purchaseInsert.priceId}`
        )
      }
      return {
        ...purchaseInsert,
        pricingModelId,
      }
    }
  )
  const result = await transaction
    .insert(purchases)
    .values(purchasesWithPricingModelId)
    .returning()
  return result.map((item) => purchasesSelectSchema.parse(item))
}

export const selectPurchaseRowDataForOrganization = async (
  organizationId: string,
  transaction: DbTransaction
): Promise<Purchase.PurchaseTableRowData[]> => {
  const result = await transaction
    .select({
      purchase: purchases,
      product: products,
      customer: customers,
      price: prices,
    })
    .from(purchases)
    .innerJoin(prices, eq(purchases.priceId, prices.id))
    .innerJoin(products, eq(prices.productId, products.id))
    .innerJoin(customers, eq(purchases.customerId, customers.id))
    .where(eq(purchases.organizationId, organizationId))

  return result.map((item) => ({
    purchase: purchasesSelectSchema.parse(item.purchase),
    product: productsSelectSchema.parse(item.product),
    customer: customersSelectSchema.parse(item.customer),
    currency: item.price.currency as CurrencyCode,
  }))
}

export const selectPurchasesTableRowData =
  createCursorPaginatedSelectFunction(
    purchases,
    config,
    purchasesTableRowDataSchema,
    async (
      purchasesResult: Purchase.Record[],
      transaction: DbTransaction
    ): Promise<z.infer<typeof purchasesTableRowDataSchema>[]> => {
      const priceIds = purchasesResult.map(
        (purchase) => purchase.priceId
      )
      const customerIds = purchasesResult.map(
        (purchase) => purchase.customerId
      )
      const purchaseIds = purchasesResult.map(
        (purchase) => purchase.id
      )

      const priceProductResults = await transaction
        .select({
          price: prices,
          product: products,
        })
        .from(prices)
        .innerJoin(products, eq(products.id, prices.productId))
        .innerJoin(customers, inArray(customers.id, customerIds))
        .where(inArray(prices.id, priceIds))

      const pricesById = new Map(
        priceProductResults.map((result) => [
          result.price.id,
          result.price,
        ])
      )
      const productsById = new Map(
        priceProductResults.map((result) => [
          result.product.id,
          result.product,
        ])
      )

      const customerResults = await transaction
        .select({
          customer: customers,
        })
        .from(customers)
        .where(inArray(customers.id, customerIds))

      const customersById = new Map(
        customerResults.map((result) => [
          result.customer.id,
          result.customer,
        ])
      )

      // Fetch succeeded payments for all purchases
      const succeededPayments = await transaction
        .select({
          payment: payments,
        })
        .from(payments)
        .where(
          and(
            inArray(payments.purchaseId, purchaseIds),
            eq(payments.status, PaymentStatus.Succeeded)
          )
        )

      // Map purchaseId to array of succeeded payments
      const paymentsByPurchaseId = new Map<
        string,
        { payment: any }[]
      >()
      for (const paymentRow of succeededPayments) {
        const purchaseId = String(paymentRow.payment.purchaseId)
        if (!paymentsByPurchaseId.has(purchaseId)) {
          paymentsByPurchaseId.set(purchaseId, [])
        }
        paymentsByPurchaseId.get(purchaseId)!.push(paymentRow)
      }

      return purchasesResult.map((purchase) => {
        const rawPrice = pricesById.get(purchase.priceId)
        // The price lookup can fail if:
        // 1. The price was deleted (data integrity issue)
        // 2. The price is a usage price with null productId (filtered out by innerJoin)
        // Either case indicates a data integrity problem since purchases should
        // only reference active, product-backed prices.
        if (!rawPrice) {
          throw new Error(
            `Purchase ${purchase.id} references price ${purchase.priceId} which was not found in the query results.`
          )
        }
        // Parse price early so Price.hasProductId type guard works.
        // This is needed because raw DB rows have type: string, but the type guard
        // expects the parsed Price.Record with narrowed type.
        const parsedPrice = pricesSelectSchema.parse(rawPrice)
        // Get product only for non-usage prices
        const product = Price.hasProductId(parsedPrice)
          ? productsById.get(parsedPrice.productId)
          : undefined
        const customer = customersById.get(purchase.customerId)!
        const customerName = customer.name
        const customerEmail = customer.email
        const succeeded =
          paymentsByPurchaseId.get(String(purchase.id)) || []
        const revenue = succeeded.reduce(
          (acc, row) => acc + (row.payment.amount || 0),
          0
        )

        return {
          purchase,
          // Product may be undefined for usage prices
          product: product
            ? productsSelectSchema.parse(product)
            : null,
          customer: customersSelectSchema.parse(customer),
          revenue,
          currency: parsedPrice.currency as CurrencyCode,
          customerName,
          customerEmail,
        }
      })
    },
    // searchableColumns: undefined (no direct column search on purchases table)
    undefined,
    /**
     * Additional search clause handler for purchases table.
     * Enables searching purchases by:
     * - Exact purchase ID match
     * - Customer name (case-insensitive partial match via ILIKE)
     * - Product name (case-insensitive partial match via ILIKE)
     *
     * The `exists()` function wraps a subquery and returns a boolean condition:
     * - Returns `true` if the subquery finds at least one matching row
     * - Returns `false` if the subquery finds zero matching rows
     * The database optimizes EXISTS subqueries to stop evaluating as soon as it finds
     * the first matching row, making it efficient for existence checks without needing JOINs.
     *
     * @param searchQuery - The search query string from the user
     * @param transaction - Database transaction for building subqueries
     * @returns SQL condition for OR-ing with other search filters, or undefined if query is empty
     */
    ({ searchQuery, transaction }) => {
      // Early return if search query is not provided
      if (!searchQuery) return undefined

      // Normalize the search query by trimming whitespace
      const trimmedQuery =
        typeof searchQuery === 'string'
          ? searchQuery.trim()
          : searchQuery

      // Only apply search filter if query is non-empty after trimming
      if (!trimmedQuery) return undefined

      // IMPORTANT: Do NOT await these queries. By not awaiting, we keep them as query builder
      // objects that Drizzle can embed into the SQL as subqueries. If we await them, they would
      // execute immediately and return data, which we can't use in the EXISTS clause.

      // Subquery to match purchases by customer name
      const customerSubquery = transaction
        .select({ id: sql`1` })
        .from(customers)
        .where(
          and(
            eq(customers.id, purchases.customerId),
            ilike(customers.name, sql`'%' || ${trimmedQuery} || '%'`)
          )
        )
        .limit(1)

      // Subquery to match purchases by product name (via prices join)
      const productSubquery = transaction
        .select({ id: sql`1` })
        .from(prices)
        .innerJoin(products, eq(products.id, prices.productId))
        .where(
          and(
            eq(prices.id, purchases.priceId),
            ilike(products.name, sql`'%' || ${trimmedQuery} || '%'`)
          )
        )
        .limit(1)

      return or(
        // Match purchases by exact ID
        eq(purchases.id, trimmedQuery),
        // Match purchases where customer name contains the search query
        exists(customerSubquery),
        // Match purchases where product name contains the search query
        exists(productSubquery)
      )
    }
  )
