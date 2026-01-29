import {
  type CountryCode,
  PriceType,
  SubscriptionItemType,
} from '@db-core/enums'
import { Customer } from '@/db/schema/customers'
import type { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import type { Invoice } from '@/db/schema/invoices'
import { billingAddressSchema } from '@/db/schema/organizations'
import type { Purchase } from '@/db/schema/purchases'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import {
  insertInvoiceLineItems,
  selectInvoiceLineItems,
} from '@/db/tableMethods/invoiceLineItemMethods'
import {
  insertInvoice,
  selectInvoices,
} from '@/db/tableMethods/invoiceMethods'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import type { DbTransaction } from '@/db/types'
import { InvoiceStatus, InvoiceType } from '@/types'
import core from '../core'

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
  const customer = (
    await selectCustomerById(purchase.customerId, transaction)
  ).unwrap()
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
    description: `${purchase.name}`,
    quantity: 1,
    price: purchase.firstInvoiceValue!,
    livemode: purchase.livemode,
    ledgerAccountId: null,
    ledgerAccountCredit: null,
    billingRunId: null,
    type: SubscriptionItemType.Static,
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
  const now = Date.now()
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
      ? (billingAddressSchema.parse(billingAddress).address
          .country as CountryCode)
      : null,
    invoiceDate: now,
    dueDate: now,
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
