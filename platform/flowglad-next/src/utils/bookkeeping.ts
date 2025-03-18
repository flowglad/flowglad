import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import { Invoice } from '@/db/schema/invoices'
import {
  insertInvoiceLineItems,
  selectInvoiceLineItems,
  selectInvoiceLineItemsAndInvoicesByInvoiceWhere,
} from '@/db/tableMethods/invoiceLineItemMethods'
import {
  selectCustomerProfileById,
  selectCustomerProfiles,
  updateCustomerProfile,
  upsertCustomerProfileByEmailAndOrganizationId,
} from '@/db/tableMethods/customerProfileMethods'
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
import { CustomerProfile } from '@/db/schema/customerProfiles'
import { billingAddressSchema, Customer } from '@/db/schema/customers'
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
    await updatePurchase(
      {
        id: payment.purchaseId,
        status: purchaseStatus,
        purchaseDate: payment.chargeDate,
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
  const amountPaidSoFarForInvoice =
    successfulPaymentsForInvoice.reduce(
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
    await generatePaymentReceiptPdfTask.trigger({
      paymentId: payment.id,
    })
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
  const customerProfile = await selectCustomerProfileById(
    purchase.customerProfileId,
    transaction
  )
  const { customerProfileId, organizationId, priceId } = purchase
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
      customerProfile,
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
  const invoicesForcustomerProfileId = await selectInvoices(
    {
      customerProfileId,
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
    customerProfileId: purchase.customerProfileId,
    purchaseId: purchase.id,
    status: InvoiceStatus.Draft,
    invoiceNumber: core.createInvoiceNumber(
      customerProfile.invoiceNumberBase ?? '',
      invoicesForcustomerProfileId.length
    ),
    currency: price.currency,
    type: InvoiceType.Purchase,
    billingPeriodId: null,
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
    customerProfile,
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

  let customerProfile = await selectCustomerProfileById(
    payload.customerProfileId,
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
    if (!customerProfile.stripeCustomerId) {
      const stripeCustomer = await createStripeCustomer({
        email: customerProfile.email!,
        name: customerProfile.name!,
        livemode,
      })
      customerProfile = await updateCustomerProfile(
        {
          id: customerProfile.id,
          stripeCustomerId: stripeCustomer.id,
        },
        transaction
      )
    }
  }

  /**
   * If the purchase is a single payment or installments,
   * we need to create an invoice for the payment and make
   * that invoice's payment intent id the purchase's payment intent id
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
    const paymentIntent = await createPaymentIntentForInvoice({
      invoice,
      invoiceLineItems: invoiceLineItems,
      organization: membershipsAndOrganization.organization,
      stripeCustomerId: customerProfile.stripeCustomerId!,
    })
    stripePaymentIntentId = paymentIntent.id
    await updateInvoice(
      {
        id: invoice.id,
        stripePaymentIntentId,
        type: InvoiceType.Purchase,
        purchaseId: purchase.id,
        billingPeriodId: null,
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
    const customerProfile = await selectCustomerProfileById(
      purchase.customerProfileId,
      transaction
    )

    const organization = await selectOrganizationById(
      purchase.organizationId,
      transaction
    )
    const paymentIntent = await createPaymentIntentForInvoice({
      invoice: {
        ...invoice,
        bankPaymentOnly,
      },
      invoiceLineItems,
      organization,
      stripeCustomerId: customerProfile.stripeCustomerId!,
    })
    await updateInvoice(
      {
        id: invoice.id,
        stripePaymentIntentId: paymentIntent.id,
        bankPaymentOnly,
        type: InvoiceType.Purchase,
        purchaseId: purchase.id,
        billingPeriodId: null,
      },
      transaction
    )

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
    },
    transaction
  )
}

export const createOrUpdateCustomerProfile = async (
  payload: {
    customerProfile: CustomerProfile.Insert
  },
  { transaction }: AuthenticatedTransactionParams
) => {
  let [customerProfile] =
    await upsertCustomerProfileByEmailAndOrganizationId(
      payload.customerProfile,
      transaction
    )
  /**
   * Find or create a customer profile
   */
  if (!customerProfile) {
    const findResult = await selectCustomerProfiles(
      {
        email: payload.customerProfile.email,
        organizationId: payload.customerProfile.organizationId,
      },
      transaction
    )
    customerProfile = findResult[0]
  }
  if (!customerProfile.stripeCustomerId) {
    const stripeCustomer = await createStripeCustomer(
      payload.customerProfile
    )
    customerProfile = await updateCustomerProfile(
      {
        id: customerProfile.id,
        stripeCustomerId: stripeCustomer.id,
      },
      transaction
    )
  }
  return { customerProfile }
}
