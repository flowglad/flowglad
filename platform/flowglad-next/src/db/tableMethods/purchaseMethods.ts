import {
  purchases,
  purchasesInsertSchema,
  purchasesSelectSchema,
  purchasesUpdateSchema,
  Purchase,
  singlePaymentPurchaseSelectSchema,
  subscriptionPurchaseSelectSchema,
  purchaseClientInsertSchema,
} from '@/db/schema/purchases'
import {
  createUpsertFunction,
  createSelectById,
  createSelectFunction,
  createInsertFunction,
  ORMMethodCreatorConfig,
  createUpdateFunction,
  whereClauseFromObject,
} from '@/db/tableUtils'
import { CheckoutFlowType, PriceType } from '@/types'
import { DbTransaction } from '@/db/types'
import { and, eq } from 'drizzle-orm'
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
import { products, productsSelectSchema } from '../schema/products'
import { z } from 'zod'
import {
  checkoutSessionClientSelectSchema,
  checkoutSessionsSelectSchema,
} from '../schema/checkoutSessions'
import { payments, paymentsSelectSchema } from '../schema/payments'
import { discountClientSelectSchema } from '../schema/discounts'
import { customerFacingFeeCalculationSelectSchema } from '../schema/feeCalculations'
import { ProperNoun } from '../schema/properNouns'
import { invoicesClientSelectSchema } from '../schema/invoices'
import { invoiceLineItemsClientSelectSchema } from '../schema/invoiceLineItems'

const config: ORMMethodCreatorConfig<
  typeof purchases,
  typeof purchasesSelectSchema,
  typeof purchasesInsertSchema,
  typeof purchasesUpdateSchema
> = {
  selectSchema: purchasesSelectSchema,
  insertSchema: purchasesInsertSchema,
  updateSchema: purchasesUpdateSchema,
}

export const selectPurchaseById = createSelectById(purchases, config)

export const selectPurchases = createSelectFunction(purchases, config)

export const insertPurchase = createInsertFunction(
  purchases,
  // @ts-expect-error
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

const subscriptionBillingInfoSchema = z.object({
  purchase: subscriptionPurchaseSelectSchema.nullish(),
  price: z.discriminatedUnion('type', [
    subscriptionPriceSelectSchema,
    usagePriceSelectSchema,
  ]),
  flowType: z.literal(CheckoutFlowType.Subscription),
  product: productsSelectSchema,
})

export type SubscriptionBillingInfoCore = z.infer<
  typeof subscriptionBillingInfoSchema
>

const singlePaymentBillingInfoSchema = z.object({
  purchase: singlePaymentPurchaseSelectSchema.nullish(),
  price: singlePaymentPriceSelectSchema,
  flowType: z.literal(CheckoutFlowType.SinglePayment),
  product: productsSelectSchema,
})

const invoiceBillingInfoSchema = z.object({
  invoice: invoicesClientSelectSchema,
  invoiceLineItems: invoiceLineItemsClientSelectSchema.array(),
  flowType: z.literal(CheckoutFlowType.Invoice),
})

export const billingInfoSchema = z
  .discriminatedUnion('flowType', [
    subscriptionBillingInfoSchema,
    singlePaymentBillingInfoSchema,
    invoiceBillingInfoSchema,
  ])
  .and(
    z.object({
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
      feeCalculation:
        customerFacingFeeCalculationSelectSchema.nullable(),
    })
  )

export type BillingInfoCore = z.infer<typeof billingInfoSchema>

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
