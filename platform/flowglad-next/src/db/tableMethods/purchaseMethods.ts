import {
  purchases,
  purchasesInsertSchema,
  purchasesSelectSchema,
  purchasesUpdateSchema,
  Purchase,
  singlePaymentPurchaseSelectSchema,
  subscriptionPurchaseSelectSchema,
  purchasesTableRowDataSchema,
} from '@/db/schema/purchases'
import {
  createUpsertFunction,
  createSelectById,
  createSelectFunction,
  createInsertFunction,
  ORMMethodCreatorConfig,
  createUpdateFunction,
  whereClauseFromObject,
  createCursorPaginatedSelectFunction,
} from '@/db/tableUtils'
import {
  CheckoutFlowType,
  PaymentStatus,
} from '@/types'
import { DbTransaction } from '@/db/types'
import { and, eq, inArray } from 'drizzle-orm'
import {
  singlePaymentPriceSelectSchema,
  subscriptionPriceSelectSchema,
  prices,
  pricesSelectSchema,
  usagePriceSelectSchema,
} from '../schema/prices'
import {
  customerClientInsertSchema,
  customers,
  customersSelectSchema,
} from '../schema/customers'
import {
  organizations,
  organizationsSelectSchema,
} from '../schema/organizations'
import {
  products,
  productsSelectSchema,
} from '../schema/products'
import { z } from 'zod'
import {
  checkoutSessionClientSelectSchema,
} from '../schema/checkoutSessions'
import { payments, paymentsSelectSchema } from '../schema/payments'
import { discountClientSelectSchema } from '../schema/discounts'
import { customerFacingFeeCalculationSelectSchema } from '../schema/feeCalculations'
import { ProperNoun } from '../schema/properNouns'
import { invoicesClientSelectSchema } from '../schema/invoices'
import { invoiceLineItemsClientSelectSchema } from '../schema/invoiceLineItems'
import { featuresClientSelectSchema } from '../schema/features'

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

export const insertPurchase = createInsertFunction(
  purchases,
  config
) as (
  payload: Purchase.Insert,
  transaction: DbTransaction
) => Promise<Purchase.Record>

export const upsertPurchaseById = createUpsertFunction(
  purchases,
  purchases.id,
  config
)

export const updatePurchase = createUpdateFunction(purchases, config)

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
  discount: discountClientSelectSchema.nullish(),
  /**
   * Only present when checkoutSession.customerId is not null
   */
  readonlyCustomerEmail: z.string().email().nullish(),
  feeCalculation: customerFacingFeeCalculationSelectSchema.nullable(),
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

export const purchaseToProperNounUpsert = (
  purchase: Purchase.Record
): ProperNoun.Insert => {
  return {
    entityId: purchase.id,
    entityType: 'purchase',
    name: purchase.name,
    organizationId: purchase.organizationId,
    livemode: purchase.livemode,
  }
}

export const bulkInsertPurchases = async (
  purchaseInserts: Purchase.Insert[],
  transaction: DbTransaction
) => {
  const result = await transaction
    .insert(purchases)
    .values(purchaseInserts)
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
  }))
}

export const selectPurchasesTableRowData =
  createCursorPaginatedSelectFunction(
    purchases,
    config,
    purchasesTableRowDataSchema,
    async (
      purchases: Purchase.Record[],
      transaction: DbTransaction
    ): Promise<z.infer<typeof purchasesTableRowDataSchema>[]> => {
      const priceIds = purchases.map((purchase) => purchase.priceId)
      const customerIds = purchases.map(
        (purchase) => purchase.customerId
      )
      const purchaseIds = purchases.map((purchase) => purchase.id)

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

      return purchases.map((purchase) => {
        const price = pricesById.get(purchase.priceId)!
        const product = productsById.get(price.productId)!
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
          product: productsSelectSchema.parse(product),
          customer: customersSelectSchema.parse(customer),
          revenue,
          customerName,
          customerEmail,
        }
      })
    }
  )
