import * as R from 'ramda'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import {
  insertCustomer,
  selectCustomerById,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import {
  deleteOpenInvoicesForPurchase,
  safelyUpdateInvoiceStatus,
} from '@/db/tableMethods/invoiceMethods'
import {
  AuthenticatedTransactionParams,
  DbTransaction,
} from '@/db/types'
import {
  CountryCode,
  InvoiceStatus,
  InvoiceType,
  PaymentStatus,
  PriceType,
  PurchaseStatus,
  SubscriptionItemType,
  IntervalUnit,
  CurrencyCode,
} from '@/types'
import { createStripeCustomer } from './stripe'
import { Purchase } from '@/db/schema/purchases'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import core from './core'
import {
  insertPurchase,
  selectPurchaseById,
  updatePurchase,
} from '@/db/tableMethods/purchaseMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { Customer } from '@/db/schema/customers'
import { billingAddressSchema } from '@/db/schema/organizations'
import { selectPayments } from '@/db/tableMethods/paymentMethods'
import { Payment } from '@/db/schema/payments'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import {
  selectOpenNonExpiredCheckoutSessions,
  updateCheckoutSessionsForOpenPurchase,
} from '@/db/tableMethods/checkoutSessionMethods'
import {
  selectDefaultPricingModel,
  insertPricingModel,
} from '@/db/tableMethods/pricingModelMethods'
import {
  selectProducts,
  insertProduct,
} from '@/db/tableMethods/productMethods'
import {
  selectPrices,
  insertPrice,
} from '@/db/tableMethods/priceMethods'
import { createSubscriptionWorkflow } from '@/subscriptions/createSubscription'
import { TransactionOutput } from '@/db/transactionEnhacementTypes'
import { Event } from '@/db/schema/events'
import { FlowgladEventType, EventNoun } from '@/types'
import { constructCustomerCreatedEventHash } from '@/utils/eventHelpers'
import { Subscription } from '@/db/schema/subscriptions'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { PricingModel } from '@/db/schema/pricingModels'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { createInitialInvoiceForPurchase } from './bookkeeping/invoices'

export const updatePurchaseStatusToReflectLatestPayment = async (
  payment: Payment.Record,
  transaction: DbTransaction
) => {
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
  }
}
/**
 * An idempotent method to update an invoice's status to reflect the latest payment.
 * @param payment
 * @param transaction
 */
export const updateInvoiceStatusToReflectLatestPayment = async (
  payment: Payment.Record,
  transaction: DbTransaction
) => {
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
    // await generatePaymentReceiptPdfTask.trigger({
    //   paymentId: payment.id,
    // })
  }
}

// Re-export from the new location to maintain backward compatibility
// Original implementation moved to ./bookkeeping/invoices.ts to avoid circular dependency
export { createInitialInvoiceForPurchase } from './bookkeeping/invoices'

/**
 * Create a purchase that is not yet completed
 * @param payload
 * @param param1
 * @returns
 */
export const createOpenPurchase = async (
  payload: Purchase.ClientInsert,
  { transaction, userId, livemode }: AuthenticatedTransactionParams
) => {
  const results = await selectMembershipAndOrganizations(
    {
      userId,
      focused: true,
    },
    transaction
  )
  const membershipsAndOrganization = results[0]
  const [{ price }] =
    await selectPriceProductAndOrganizationByPriceWhere(
      { id: payload.priceId },
      transaction
    )

  let customer = await selectCustomerById(
    payload.customerId,
    transaction
  )

  let stripePaymentIntentId: string | null = null
  const purchaseInsert: Purchase.Insert = {
    ...payload,
    organizationId: membershipsAndOrganization.organization.id,
    status: PurchaseStatus.Open,
    livemode,
  }
  const purchase = await insertPurchase(purchaseInsert, transaction)

  /**
   * For subscription purchases, we need to create a Stripe subscription
   * and then create an invoice for the payment.
   */
  if (price.type === PriceType.Subscription) {
    if (!customer.stripeCustomerId) {
      const stripeCustomer = await createStripeCustomer({
        email: customer.email!,
        name: customer.name!,
        livemode,
      })
      customer = await updateCustomer(
        {
          id: customer.id,
          stripeCustomerId: stripeCustomer.id,
          billingAddress: customer.billingAddress,
        },
        transaction
      )
    }
  }

  /**
   * If the purchase is a single payment or installments,
   * we need to create an invoice for the payment.
   * Subscriptions need to have their invoices created AFTER the subscription is created
   */
  if (price.type === PriceType.SinglePayment) {
    const { invoice, invoiceLineItems } =
      await createInitialInvoiceForPurchase(
        {
          purchase,
        },
        transaction
      )
  }
  return purchase
}

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
    displayFeatures: null,
    singularQuantityLabel: null,
    pluralQuantityLabel: null,
    imageURL: null,
    externalId: null,
  }
}

export const createFreePlanPriceInsert = (
  defaultProduct: Product.Record,
  defaultCurrency: CurrencyCode
): Price.Insert => {
  return {
    productId: defaultProduct.id,
    unitPrice: 0,
    isDefault: true,
    type: PriceType.Subscription,
    intervalUnit: IntervalUnit.Month,
    intervalCount: 1,
    currency: defaultCurrency,
    livemode: defaultProduct.livemode,
    active: true,
    name: 'Free Plan',
    trialPeriodDays: null,
    setupFeeAmount: null,
    usageEventsPerUnit: null,
    usageMeterId: null,
    externalId: null,
    slug: null,
    startsWithCreditTrial: false,
    overagePriceId: null,
  }
}
export const createCustomerBookkeeping = async (
  payload: {
    customer: Omit<Customer.Insert, 'livemode'>
  },
  {
    transaction,
    organizationId,
    livemode,
  }: AuthenticatedTransactionParams
): Promise<
  TransactionOutput<{
    customer: Customer.Record
    subscription?: Subscription.Record
    subscriptionItems?: SubscriptionItem.Record[]
  }>
> => {
  // Security: Validate that customer organizationId matches auth context
  if (
    payload.customer.organizationId &&
    payload.customer.organizationId !== organizationId
  ) {
    throw new Error(
      'Customer organizationId must match authenticated organizationId'
    )
  }

  let customer = await insertCustomer(
    { ...payload.customer, livemode },
    transaction
  )
  if (!customer.stripeCustomerId) {
    const stripeCustomer = await createStripeCustomer(customer)
    customer = await updateCustomer(
      {
        id: customer.id,
        stripeCustomerId: stripeCustomer.id,
      },
      transaction
    )
  }

  const timestamp = new Date()
  const eventsToLog: Event.Insert[] = []

  // Create customer created event
  eventsToLog.push({
    type: FlowgladEventType.CustomerCreated,
    occurredAt: timestamp,
    organizationId: customer.organizationId,
    livemode: customer.livemode,
    payload: {
      object: EventNoun.Customer,
      id: customer.id,
    },
    submittedAt: timestamp,
    hash: constructCustomerCreatedEventHash(customer),
    metadata: {},
    processedAt: null,
  })

  // Create default subscription for the customer
  // Use customer's organizationId to ensure consistency
  if (customer.organizationId) {
    try {
      // Determine which pricing model to use
      let pricingModelId = customer.pricingModelId

      // If no pricing model specified, use the default one
      if (!pricingModelId) {
        const defaultPricingModel = await selectDefaultPricingModel(
          {
            organizationId: customer.organizationId,
            livemode: customer.livemode,
          },
          transaction
        )
        if (defaultPricingModel) {
          pricingModelId = defaultPricingModel.id
        }
      }

      if (pricingModelId) {
        // Get the default product for this pricing model
        const products = await selectProducts(
          {
            pricingModelId,
            default: true,
            active: true,
          },
          transaction
        )

        if (products.length > 0) {
          const defaultProduct = products[0]

          // Get the default price for this product
          const prices = await selectPrices(
            {
              productId: defaultProduct.id,
              isDefault: true,
              active: true,
            },
            transaction
          )

          if (prices.length > 0) {
            const defaultPrice = prices[0]

            // Get the organization details - use customer's organizationId for consistency
            const organization = await selectOrganizationById(
              customer.organizationId,
              transaction
            )

            // Create the subscription
            const subscriptionResult =
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
                  interval:
                    defaultPrice.intervalUnit || IntervalUnit.Month,
                  intervalCount: defaultPrice.intervalCount || 1,
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
                transaction
              )

            // Merge events from subscription creation
            if (subscriptionResult.eventsToLog) {
              eventsToLog.push(...subscriptionResult.eventsToLog)
            }

            // Return combined result with all events and ledger commands
            return {
              result: {
                customer,
                subscription: subscriptionResult.result.subscription,
                subscriptionItems:
                  subscriptionResult.result.subscriptionItems,
              },
              eventsToLog,
              ledgerCommand: subscriptionResult.ledgerCommand,
            }
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
  }

  // Return just the customer with events
  return {
    result: { customer },
    eventsToLog,
  }
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
  },
  {
    transaction,
    organizationId,
    livemode,
  }: Omit<AuthenticatedTransactionParams, 'userId'>
): Promise<
  TransactionOutput<{
    pricingModel: PricingModel.Record
    defaultProduct: Product.Record
    defaultPrice: Price.Record
  }>
> => {
  // 1. Create the pricing model
  const pricingModel = await insertPricingModel(
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
      organization.defaultCurrency
    ),
    transaction
  )

  // 5. Create events
  const timestamp = new Date()
  const eventsToLog: Event.Insert[] = []

  return {
    result: {
      pricingModel,
      defaultProduct,
      defaultPrice,
    },
    eventsToLog,
  }
}
