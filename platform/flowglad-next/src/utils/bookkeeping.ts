import * as R from 'ramda'
import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import { Invoice } from '@/db/schema/invoices'
import {
  insertInvoiceLineItems,
  selectInvoiceLineItems,
  selectInvoiceLineItemsAndInvoicesByInvoiceWhere,
} from '@/db/tableMethods/invoiceLineItemMethods'
import {
  insertCustomer,
  selectCustomerById,
  selectCustomers,
  updateCustomer,
  upsertCustomerByEmailAndOrganizationId,
} from '@/db/tableMethods/customerMethods'
import {
  deleteOpenInvoicesForPurchase,
  insertInvoice,
  safelyUpdateInvoiceStatus,
  selectInvoices,
  updateInvoice,
} from '@/db/tableMethods/invoiceMethods'
import {
  AuthenticatedTransactionParams,
  DbTransaction,
} from '@/db/types'
import {
  InvoiceStatus,
  InvoiceType,
  PaymentStatus,
  PriceType,
  PurchaseStatus,
} from '@/types'
import {
  createPaymentIntentForInvoice,
  createStripeCustomer,
} from './stripe'
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
import { generatePaymentReceiptPdfTask } from '@/trigger/generate-receipt-pdf'

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

export const createInitialInvoiceForPurchase = async (
  params: {
    purchase: Purchase.Record
  },
  transaction: DbTransaction
) => {
  const { purchase } = params
  const [existingInvoice] = await selectInvoices(
    {
      purchaseId: purchase.id,
    },
    transaction
  )
  const customer = await selectCustomerById(
    purchase.customerId,
    transaction
  )
  const { customerId, organizationId, priceId } = purchase
  const [{ price, organization }] =
    await selectPriceProductAndOrganizationByPriceWhere(
      { id: priceId },
      transaction
    )
  if (existingInvoice) {
    const invoiceLineItems = await selectInvoiceLineItems(
      {
        invoiceId: existingInvoice.id,
      },
      transaction
    )
    return {
      invoice: existingInvoice,
      invoiceLineItems,
      organization,
      customer,
    }
  }

  const invoiceLineItemInput: InvoiceLineItem.Insert = {
    invoiceId: '1',
    priceId,
    description: `${purchase.name} First Invoice`,
    quantity: 1,
    price: purchase.firstInvoiceValue!,
    livemode: purchase.livemode,
  }
  if ([PriceType.SinglePayment].includes(price.type)) {
    invoiceLineItemInput.quantity = 1
    invoiceLineItemInput.price = purchase.firstInvoiceValue!
  }
  const trialPeriodDays = core.isNil(purchase.trialPeriodDays)
    ? price.trialPeriodDays
    : purchase.trialPeriodDays
  if (trialPeriodDays) {
    invoiceLineItemInput.description = `${purchase.name} - Trial Period`
    invoiceLineItemInput.price = 0
  }
  const invoicesForcustomerId = await selectInvoices(
    {
      customerId,
    },
    transaction
  )
  const invoiceLineItemInserts = [invoiceLineItemInput]
  const subtotal = invoiceLineItemInserts.reduce(
    (acc, { price, quantity }) => acc + price * quantity,
    0
  )
  const { billingAddress, bankPaymentOnly } = purchase
  const invoiceInsert: Invoice.Insert = {
    livemode: purchase.livemode,
    customerId: purchase.customerId,
    purchaseId: purchase.id,
    status: InvoiceStatus.Draft,
    invoiceNumber: core.createInvoiceNumber(
      customer.invoiceNumberBase ?? '',
      invoicesForcustomerId.length
    ),
    currency: price.currency,
    type: InvoiceType.Purchase,
    billingPeriodId: null,
    subscriptionId: null,
    subtotal,
    applicationFee: 0,
    taxRatePercentage: '0',
    bankPaymentOnly,
    organizationId,
    taxCountry: billingAddress
      ? billingAddressSchema.parse(billingAddress).address.country
      : null,
  }
  const invoice: Invoice.Record = await insertInvoice(
    invoiceInsert,
    transaction
  )

  const invoiceLineItems = existingInvoice
    ? await selectInvoiceLineItems(
        {
          invoiceId: invoice.id,
        },
        transaction
      )
    : await insertInvoiceLineItems(
        invoiceLineItemInserts.map((invoiceLineItemInsert) => ({
          ...invoiceLineItemInsert,
          invoiceId: invoice.id,
        })),
        transaction
      )

  return {
    invoice,
    invoiceLineItems,
    organization,
    customer,
  }
}

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

export const editOpenPurchase = async (
  payload: Purchase.Update,
  { transaction }: AuthenticatedTransactionParams
) => {
  const oldPurchase = await selectPurchaseById(
    payload.id,
    transaction
  )
  const newPrice = await selectPriceById(
    payload.priceId ?? oldPurchase.priceId,
    transaction
  )
  const purchase = await updatePurchase(payload, transaction)
  let stripeSetupIntentId: string | null = null
  let stripePaymentIntentId: string | null = null
  /**
   * Important - null is falsy, so we need to check whether bankPaymentOnly is
   * changing. If not, we use the old value.
   */
  const bankPaymentOnly = core.isNil(payload.bankPaymentOnly)
    ? oldPurchase.bankPaymentOnly
    : payload.bankPaymentOnly

  if (newPrice.type === PriceType.Subscription) {
    const oldPrice = await selectPriceById(
      oldPurchase.priceId,
      transaction
    )
    /**
     * If the old price was not a subscription, we need to delete the open invoices
     * because they are no longer valid.
     */
    if (oldPrice.type !== PriceType.Subscription) {
      await deleteOpenInvoicesForPurchase(oldPurchase.id, transaction)
    }
  } else {
    /**
     * in all other cases, we need to create (or update) a payment intent for the invoice
     * and then associate that payment intent with the purchase and invoice
     */
    const [{ invoiceLineItems, invoice }] =
      await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
        {
          purchaseId: purchase.id,
        },
        transaction
      )
    const customer = await selectCustomerById(
      purchase.customerId,
      transaction
    )

    const organization = await selectOrganizationById(
      purchase.organizationId,
      transaction
    )
    /**
     * Create a payment intent for the invoice,
     * but don't attach it to the invoice directly.
     * Instead, it should attach to the checkout session,
     * to enforce our invariant that all payment intents have a corresponding checkout session.
     */
    const paymentIntent = await createPaymentIntentForInvoice({
      invoice: {
        ...invoice,
        bankPaymentOnly,
      },
      invoiceLineItems,
      organization,
      stripeCustomerId: customer.stripeCustomerId!,
    })

    const openCheckoutSessions =
      await selectOpenNonExpiredCheckoutSessions(
        {
          purchaseId: payload.id,
        },
        transaction
      )
    if (openCheckoutSessions.length > 0) {
      await updateCheckoutSessionsForOpenPurchase(
        {
          stripePaymentIntentId: paymentIntent.id,
          purchaseId: payload.id,
        },
        transaction
      )
    }
  }
  return updatePurchase(
    {
      id: payload.id,
      priceType: newPrice.type,
    },
    transaction
  )
}

export const createCustomerBookkeeping = async (
  payload: {
    customer: Customer.Insert
  },
  { transaction }: AuthenticatedTransactionParams
) => {
  let customer = await insertCustomer(payload.customer, transaction)
  if (!customer.stripeCustomerId) {
    const stripeCustomer = await createStripeCustomer(
      payload.customer
    )
    customer = await updateCustomer(
      {
        id: customer.id,
        stripeCustomerId: stripeCustomer.id,
      },
      transaction
    )
  }
  return { customer }
}
