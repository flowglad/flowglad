import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { selectPurchases } from '@/db/tableMethods/purchaseMethods'
import { selectRichSubscriptionsAndActiveItems } from '@/db/tableMethods/subscriptionItemMethods'
import { selectPaymentMethods } from '@/db/tableMethods/paymentMethodMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import {
  isSubscriptionCurrent,
  subscriptionWithCurrent,
} from '@/db/tableMethods/subscriptionMethods'
import { selectPricingModelForCustomer } from '@/db/tableMethods/pricingModelMethods'
import { InvoiceStatus } from '@/types'
import { DbTransaction } from '@/db/types'

export const customerBillingTransaction = async (
  params: {
    externalId: string
    organizationId: string
  },
  transaction: DbTransaction
) => {
  const [customer] = await selectCustomers(params, transaction)
  const subscriptions = await selectRichSubscriptionsAndActiveItems(
    { customerId: customer.id },
    transaction
  )
  const pricingModel = await selectPricingModelForCustomer(
    customer,
    transaction
  )
  const customerFacingInvoiceStatuses: InvoiceStatus[] = [
    InvoiceStatus.AwaitingPaymentConfirmation,
    InvoiceStatus.Paid,
    InvoiceStatus.PartiallyRefunded,
    InvoiceStatus.Open,
    InvoiceStatus.FullyRefunded,
  ]
  const invoices =
    await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
      {
        customerId: customer.id,
        status: customerFacingInvoiceStatuses,
      },
      transaction
    )
  const paymentMethods = await selectPaymentMethods(
    { customerId: customer.id },
    transaction
  )
  const purchases = await selectPurchases(
    { customerId: customer.id },
    transaction
  )
  const currentSubscriptions = subscriptions.filter((item) => {
    return isSubscriptionCurrent(item.status)
  })
  return {
    customer,
    purchases,
    invoices,
    paymentMethods,
    pricingModel,
    subscriptions: subscriptions.map(subscriptionWithCurrent),
    currentSubscriptions: currentSubscriptions.map(
      subscriptionWithCurrent
    ),
  }
}
