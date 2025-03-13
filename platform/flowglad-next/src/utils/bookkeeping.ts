import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import { Invoice } from '@/db/schema/invoices'
import { Organization } from '@/db/schema/organizations'
import {
  insertInvoiceLineItems,
  selectInvoiceLineItems,
  selectInvoiceLineItemsAndInvoicesByInvoiceWhere,
} from '@/db/tableMethods/invoiceLineItemMethods'
import {
  selectCustomerProfileById,
  selectCustomerProfiles,
  updateCustomerProfile,
  upsertCustomerProfileBycustomerIdAndorganizationId,
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
  PurchaseSessionType,
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
  selectPurchasesCustomerProfileAndCustomer,
  updatePurchase,
} from '@/db/tableMethods/purchaseMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { CustomerProfile } from '@/db/schema/customerProfiles'
import { billingAddressSchema, Customer } from '@/db/schema/customers'
import { selectPayments } from '@/db/tableMethods/paymentMethods'
import { Payment } from '@/db/schema/payments'
import { selectVariantById } from '@/db/tableMethods/variantMethods'
import { selectVariantProductAndOrganizationByVariantWhere } from '@/db/tableMethods/variantMethods'
import {
  bulkUpdatePurchaseSessions,
  selectOpenNonExpiredPurchaseSessions,
  updatePurchaseSessionsForOpenPurchase,
} from '@/db/tableMethods/purchaseSessionMethods'
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
  const [invoiceAndLineItems] =
    await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
      {
        id: payment.invoiceId,
      },
      transaction
    )
  if (invoiceAndLineItems.status === InvoiceStatus.Paid) {
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
  const invoiceTotalAmount =
    invoiceAndLineItems.invoiceLineItems.reduce(
      (acc: number, { price, quantity }) => acc + price * quantity,
      0
    )
  if (amountPaidSoFarForInvoice >= invoiceTotalAmount) {
    await safelyUpdateInvoiceStatus(
      invoiceAndLineItems,
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
  const { customerProfileId, organizationId, variantId } = purchase
  const [{ variant, organization }] =
    await selectVariantProductAndOrganizationByVariantWhere(
      { id: variantId },
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
    variantId,
    description: `${purchase.name} First Invoice`,
    quantity: 1,
    price: purchase.firstInvoiceValue!,
    livemode: purchase.livemode,
  }
  if ([PriceType.SinglePayment].includes(variant.priceType)) {
    invoiceLineItemInput.quantity = 1
    invoiceLineItemInput.price = purchase.firstInvoiceValue!
  }
  const trialPeriodDays = core.isNil(purchase.trialPeriodDays)
    ? variant.trialPeriodDays
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
    currency: variant.currency,
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
  const [{ variant }] =
    await selectVariantProductAndOrganizationByVariantWhere(
      { id: payload.variantId },
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
  if (variant.priceType === PriceType.Subscription) {
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
  if (variant.priceType === PriceType.SinglePayment) {
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
  const variantUpdated = payload.variantId !== purchase.variantId
  const trialPeriodDaysUpdated =
    payload.trialPeriodDays !== purchase.trialPeriodDays
  const pricePerBillingCycleUpdated =
    payload.pricePerBillingCycle !== purchase.pricePerBillingCycle
  const intervalUnitUpdated =
    payload.intervalUnit !== purchase.intervalUnit
  const invtervalCountUpdated =
    payload.intervalCount !== purchase.intervalCount

  return (
    variantUpdated ||
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
  const [{ customerProfile, purchase: oldPurchase }] =
    await selectPurchasesCustomerProfileAndCustomer(
      { id: payload.id },
      transaction
    )
  if (!oldPurchase) {
    throw new Error(`Purchase ${payload.id} not found`)
  }
  const newVariant = await selectVariantById(
    payload.variantId ?? oldPurchase.variantId,
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

  if (newVariant.priceType === PriceType.Subscription) {
    const oldVariant = await selectVariantById(
      oldPurchase.variantId,
      transaction
    )
    /**
     * If the old variant was not a subscription, we need to delete the open invoices
     * because they are no longer valid.
     */
    if (oldVariant.priceType !== PriceType.Subscription) {
      await deleteOpenInvoicesForPurchase(oldPurchase.id, transaction)
    }
  } else {
    /**
     * in all other cases, we need to create (or update) a payment intent for the invoice
     * and then associate that payment intent with the purchase and invoice
     */
    const [{ invoiceLineItems, ...invoice }] =
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

    const openPurchaseSessions =
      await selectOpenNonExpiredPurchaseSessions(
        {
          purchaseId: payload.id,
        },
        transaction
      )
    if (openPurchaseSessions.length > 0) {
      await updatePurchaseSessionsForOpenPurchase(
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
    customer: Customer.Record
    customerProfile: CustomerProfile.Insert
  },
  { transaction }: AuthenticatedTransactionParams
) => {
  let [customerProfile] =
    await upsertCustomerProfileBycustomerIdAndorganizationId(
      {
        ...payload.customerProfile,
        customerId: payload.customer.id,
      },
      transaction
    )
  /**
   * Find or create a customer profile
   */
  if (!customerProfile) {
    const findResult = await selectCustomerProfiles(
      {
        customerId: payload.customerProfile.customerId,
        organizationId: payload.customerProfile.organizationId,
      },
      transaction
    )
    customerProfile = findResult[0]
  }
  if (!customerProfile.stripeCustomerId) {
    const stripeCustomer = await createStripeCustomer(
      payload.customer
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
