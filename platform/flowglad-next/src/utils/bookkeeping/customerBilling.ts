import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { selectPurchases } from '@/db/tableMethods/purchaseMethods'
import { selectRichSubscriptionsAndActiveItems } from '@/db/tableMethods/subscriptionItemMethods'
import {
  safelyUpdatePaymentMethod,
  selectPaymentMethodById,
  selectPaymentMethods,
} from '@/db/tableMethods/paymentMethodMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import {
  isSubscriptionCurrent,
  safelyUpdateSubscriptionsForCustomerToNewPaymentMethod,
  subscriptionWithCurrent,
} from '@/db/tableMethods/subscriptionMethods'
import { selectPricingModelForCustomer } from '@/db/tableMethods/pricingModelMethods'
import { InvoiceStatus } from '@/types'
import { DbTransaction } from '@/db/types'
import { Customer } from '@/db/schema/customers'
import { TRPCError } from '@trpc/server'

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
    return isSubscriptionCurrent(item.status, item.cancellationReason)
  })
  return {
    customer,
    purchases,
    invoices,
    paymentMethods,
    pricingModel,
    subscriptions,
    currentSubscriptions,
  }
}

export const setDefaultPaymentMethodForCustomer = async (
  { paymentMethodId }: { paymentMethodId: string },
  transaction: DbTransaction
) => {
  // Verify the payment method belongs to the customer
  const paymentMethod = await selectPaymentMethodById(
    paymentMethodId,
    transaction
  )

  // Check if already default
  if (paymentMethod.default) {
    await safelyUpdateSubscriptionsForCustomerToNewPaymentMethod(
      paymentMethod,
      transaction
    )
    return {
      success: true,
      paymentMethod,
    }
  }

  try {
    // Update in database (safelyUpdatePaymentMethod handles setting others to non-default)
    const updatedPaymentMethod = await safelyUpdatePaymentMethod(
      {
        id: paymentMethodId,
        default: true,
      },
      transaction
    )
    await safelyUpdateSubscriptionsForCustomerToNewPaymentMethod(
      updatedPaymentMethod,
      transaction
    )
    return {
      success: true,
      paymentMethod: updatedPaymentMethod,
    }
  } catch (error) {
    console.error('Error setting default payment method:', error)
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to set default payment method',
    })
  }
}
