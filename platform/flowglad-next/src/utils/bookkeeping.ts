import { Result } from 'better-result'
import * as R from 'ramda'
import { createDefaultPriceConfig } from '@/constants/defaultPlanConfig'
import type { Customer } from '@/db/schema/customers'
import type { Payment } from '@/db/schema/payments'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { Purchase } from '@/db/schema/purchases'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import {
  insertCustomer,
  selectCustomerById,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import { safelyUpdateInvoiceStatus } from '@/db/tableMethods/invoiceMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPayments } from '@/db/tableMethods/paymentMethods'
import {
  insertPrice,
  selectPriceProductAndOrganizationByPriceWhere,
  selectPricesAndProductsByProductWhere,
} from '@/db/tableMethods/priceMethods'
import {
  safelyInsertPricingModel,
  selectDefaultPricingModel,
  selectPricingModelById,
} from '@/db/tableMethods/pricingModelMethods'
import { insertProduct } from '@/db/tableMethods/productMethods'
import {
  insertPurchase,
  selectPurchaseById,
  updatePurchase,
} from '@/db/tableMethods/purchaseMethods'
import type {
  AuthenticatedTransactionParams,
  TransactionEffectsContext,
} from '@/db/types'
import { createSubscriptionWorkflow } from '@/subscriptions/createSubscription'
import {
  type CurrencyCode,
  EventNoun,
  FlowgladEventType,
  type IntervalUnit,
  InvoiceStatus,
  PaymentStatus,
  PriceType,
  PurchaseStatus,
} from '@/types'
import { CacheDependency } from '@/utils/cache'
import { constructCustomerCreatedEventHash } from '@/utils/eventHelpers'
import { createInitialInvoiceForPurchase } from './bookkeeping/invoices'
import { createStripeCustomer } from './stripe'

export const updatePurchaseStatusToReflectLatestPayment = async (
  payment: Payment.Record,
  ctx: TransactionEffectsContext
) => {
  const { transaction, invalidateCache } = ctx
  const paymentStatus = payment.status
  let purchaseStatus: PurchaseStatus = PurchaseStatus.Pending
  if (paymentStatus === PaymentStatus.Succeeded) {
    purchaseStatus = PurchaseStatus.Paid
  } else if (paymentStatus === PaymentStatus.Canceled) {
    purchaseStatus = PurchaseStatus.Failed
  } else if (paymentStatus === PaymentStatus.Processing) {
    purchaseStatus = PurchaseStatus.Pending
  }
  if (payment.purchaseId) {
    const purchase = await selectPurchaseById(
      payment.purchaseId,
      transaction
    )
    await updatePurchase(
      {
        id: payment.purchaseId,
        status: purchaseStatus,
        purchaseDate: payment.chargeDate,
        priceType: purchase.priceType,
      },
      transaction
    )
    // Invalidate purchase cache after updating purchase content (status)
    invalidateCache(CacheDependency.purchase(payment.purchaseId))
  }
}
/**
 * An idempotent method to update an invoice's status to reflect the latest payment.
 * @param payment
 * @param ctx
 */
export const updateInvoiceStatusToReflectLatestPayment = async (
  payment: Payment.Record,
  ctx: TransactionEffectsContext
) => {
  const { transaction, invalidateCache } = ctx
  /**
   * Only update the invoice status if the payment intent status is succeeded
   */
  if (payment.status !== PaymentStatus.Succeeded) {
    return
  }
  const [{ invoice, invoiceLineItems }] =
    await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
      {
        id: payment.invoiceId,
      },
      transaction
    )
  if (invoice.status === InvoiceStatus.Paid) {
    return
  }

  const successfulPaymentsForInvoice = await selectPayments(
    {
      invoiceId: payment.invoiceId,
      status: PaymentStatus.Succeeded,
    },
    transaction
  )
  const dedupedSuccessfulPaymentsForInvoice = R.uniqBy(
    (item) => item.id,
    [payment, ...successfulPaymentsForInvoice]
  ).flat()
  const amountPaidSoFarForInvoice =
    dedupedSuccessfulPaymentsForInvoice.reduce(
      (acc, payment) => acc + payment.amount,
      0
    )
  const invoiceTotalAmount = invoiceLineItems.reduce(
    (acc: number, { price, quantity }) => acc + price * quantity,
    0
  )
  if (amountPaidSoFarForInvoice >= invoiceTotalAmount) {
    await safelyUpdateInvoiceStatus(
      invoice,
      InvoiceStatus.Paid,
      transaction
    )
    // Invalidate invoice cache after updating invoice content (status)
    invalidateCache(CacheDependency.invoice(invoice.id))
    // await generatePaymentReceiptPdfTask.trigger({
    //   paymentId: payment.id,
    // })
  }
}

// Re-export from the new location to maintain backward compatibility
// Original implementation moved to ./bookkeeping/invoices.ts to avoid circular dependency
export { createInitialInvoiceForPurchase } from './bookkeeping/invoices'

export const purchaseSubscriptionFieldsUpdated = (
  purchase: Purchase.Record,
  payload: Purchase.Update
) => {
  const priceUpdated = payload.priceId !== purchase.priceId
  const trialPeriodDaysUpdated =
    payload.trialPeriodDays !== purchase.trialPeriodDays
  const pricePerBillingCycleUpdated =
    payload.pricePerBillingCycle !== purchase.pricePerBillingCycle
  const intervalUnitUpdated =
    payload.intervalUnit !== purchase.intervalUnit
  const invtervalCountUpdated =
    payload.intervalCount !== purchase.intervalCount

  return (
    priceUpdated ||
    trialPeriodDaysUpdated ||
    pricePerBillingCycleUpdated ||
    intervalUnitUpdated ||
    invtervalCountUpdated
  )
}

export const createFreePlanProductInsert = (
  pricingModel: PricingModel.Record
): Product.Insert => {
  return {
    name: 'Free Plan',
    slug: 'free',
    default: true,
    description: 'Default plan',
    pricingModelId: pricingModel.id,
    organizationId: pricingModel.organizationId,
    livemode: pricingModel.livemode,
    active: true,
    singularQuantityLabel: null,
    pluralQuantityLabel: null,
    imageURL: null,
    externalId: null,
  }
}

export const createFreePlanPriceInsert = (
  defaultProduct: Product.Record,
  defaultCurrency: CurrencyCode,
  defaultPlanIntervalUnit?: IntervalUnit
): Price.Insert => {
  const config = createDefaultPriceConfig()
  if (defaultPlanIntervalUnit) {
    // Return subscription price when interval unit is provided
    return {
      productId: defaultProduct.id,
      unitPrice: config.unitPrice,
      isDefault: config.isDefault,
      type: PriceType.Subscription,
      intervalUnit: defaultPlanIntervalUnit,
      intervalCount: config.intervalCount,
      currency: defaultCurrency,
      livemode: defaultProduct.livemode,
      active: true,
      name: config.name,
      trialPeriodDays: null,
      usageEventsPerUnit: null,
      usageMeterId: null,
      externalId: null,
      slug: config.slug,
    }
  } else {
    // Return single payment price when no interval unit is provided
    return {
      productId: defaultProduct.id,
      unitPrice: config.unitPrice,
      isDefault: config.isDefault,
      type: PriceType.SinglePayment,
      intervalUnit: null,
      intervalCount: null,
      currency: defaultCurrency,
      livemode: defaultProduct.livemode,
      active: true,
      name: config.name,
      trialPeriodDays: null,
      usageEventsPerUnit: null,
      usageMeterId: null,
      externalId: null,
      slug: config.slug,
    }
  }
}
export const createCustomerBookkeeping = async (
  payload: {
    customer: Omit<Customer.Insert, 'livemode' | 'pricingModelId'> & {
      pricingModelId?: string
    }
  },
  ctx: TransactionEffectsContext & {
    organizationId: string
    livemode: boolean
  }
): Promise<{
  customer: Customer.Record
  subscription?: Subscription.Record
  subscriptionItems?: SubscriptionItem.Record[]
}> => {
  const {
    transaction,
    organizationId,
    livemode,
    invalidateCache,
    emitEvent,
    enqueueLedgerCommand,
  } = ctx
  // Security: Validate that customer organizationId matches auth context
  if (
    payload.customer.organizationId &&
    payload.customer.organizationId !== organizationId
  ) {
    throw new Error(
      'Customer organizationId must match authenticated organizationId'
    )
  }
  const pricingModel = payload.customer.pricingModelId
    ? await selectPricingModelById(
        payload.customer.pricingModelId,
        transaction
      )
    : await selectDefaultPricingModel(
        { organizationId: payload.customer.organizationId, livemode },
        transaction
      )

  if (!pricingModel) {
    throw new Error(
      `No pricing model found for customer. Organization: ${payload.customer.organizationId}, livemode: ${livemode}`
    )
  }

  let customer = await insertCustomer(
    {
      ...payload.customer,
      livemode,
      pricingModelId: pricingModel.id,
    },
    transaction
  )
  if (!customer.stripeCustomerId) {
    const stripeCustomer = await createStripeCustomer({
      email: customer.email,
      name: customer.name,
      organizationId: customer.organizationId,
      livemode: customer.livemode,
      createdBy: 'createCustomerBookkeeping',
    })
    customer = await updateCustomer(
      {
        id: customer.id,
        stripeCustomerId: stripeCustomer.id,
      },
      transaction
    )
  }

  const timestamp = Date.now()

  // Emit customer created event via callback
  emitEvent({
    type: FlowgladEventType.CustomerCreated,
    occurredAt: timestamp,
    organizationId: customer.organizationId,
    livemode: customer.livemode,
    payload: {
      object: EventNoun.Customer,
      id: customer.id,
      customer: {
        id: customer.id,
        externalId: customer.externalId,
      },
    },
    submittedAt: timestamp,
    hash: constructCustomerCreatedEventHash(customer),
    metadata: {},
    processedAt: null,
  })

  // Create default subscription for the customer
  // Use customer's organizationId to ensure consistency
  try {
    // Use the pricing model from customer creation
    const pricingModelId = pricingModel.id
    // Get the default product for this pricing model
    const [product] = await selectPricesAndProductsByProductWhere(
      {
        pricingModelId,
        default: true,
        active: true,
      },
      transaction
    )
    if (product) {
      const defaultProduct = product
      const defaultPrice = product.defaultPrice
      if (defaultPrice) {
        // Get the organization details - use customer's organizationId for consistency
        const organization = await selectOrganizationById(
          customer.organizationId,
          transaction
        )

        // Create the subscription - pass callbacks directly
        const subscriptionResult = (
          await createSubscriptionWorkflow(
            {
              organization,
              customer: {
                id: customer.id,
                stripeCustomerId: customer.stripeCustomerId,
                livemode: customer.livemode,
                organizationId: customer.organizationId,
              },
              product: defaultProduct,
              price: defaultPrice,
              quantity: 1,
              livemode: customer.livemode,
              startDate: new Date(),
              interval: defaultPrice.intervalUnit,
              intervalCount: defaultPrice.intervalCount,
              trialEnd: defaultPrice.trialPeriodDays
                ? new Date(
                    Date.now() +
                      defaultPrice.trialPeriodDays *
                        24 *
                        60 *
                        60 *
                        1000
                  )
                : undefined,
              autoStart: true,
              name: `${defaultProduct.name} Subscription`,
            },
            {
              transaction,
              invalidateCache,
              emitEvent,
              enqueueLedgerCommand,
            }
          )
        ).unwrap()

        return {
          customer,
          subscription: subscriptionResult.subscription,
          subscriptionItems: subscriptionResult.subscriptionItems,
        }
      }
    }
  } catch (error) {
    // Log the error but don't fail customer creation
    console.error(
      'Failed to create default subscription for customer:',
      error
    )
  }

  // Return just the customer
  return { customer }
}

/**
 * Creates a pricing model with a default "Base Plan" product and a default price of 0
 */
export const createPricingModelBookkeeping = async (
  payload: {
    pricingModel: Omit<
      PricingModel.Insert,
      'livemode' | 'organizationId'
    >
    defaultPlanIntervalUnit?: IntervalUnit
  },
  {
    transaction,
    organizationId,
    livemode,
  }: Omit<AuthenticatedTransactionParams, 'userId'>
): Promise<
  Result<
    {
      pricingModel: PricingModel.Record
      defaultProduct: Product.Record
      defaultPrice: Price.Record
    },
    Error
  >
> => {
  // 1. Create the pricing model
  const pricingModel = await safelyInsertPricingModel(
    {
      ...payload.pricingModel,
      organizationId,
      livemode,
    },
    transaction
  )

  // 2. Create the default "Base Plan" product
  const defaultProduct = await insertProduct(
    createFreePlanProductInsert(pricingModel),
    transaction
  )

  // 3. Get organization for default currency
  const organization = await selectOrganizationById(
    organizationId,
    transaction
  )

  // 4. Create the default price with unitPrice of 0
  const defaultPrice = await insertPrice(
    createFreePlanPriceInsert(
      defaultProduct,
      organization.defaultCurrency,
      payload.defaultPlanIntervalUnit
    ),
    transaction
  )

  return Result.ok({
    pricingModel,
    defaultProduct,
    defaultPrice,
  })
}
