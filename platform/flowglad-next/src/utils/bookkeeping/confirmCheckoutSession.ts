import {
  selectCheckoutSessionById,
  updateCheckoutSession,
} from '@/db/tableMethods/checkoutSessionMethods'
import {
  selectCustomerById,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import {
  createStripeCustomer,
  getSetupIntent,
  updatePaymentIntent,
  updateSetupIntent,
} from '@/utils/stripe'
import { CheckoutSessionStatus, CheckoutSessionType } from '@/types'
import { Customer } from '@/db/schema/customers'
import { selectPurchaseAndCustomersByPurchaseWhere } from '@/db/tableMethods/purchaseMethods'
import core from '@/utils/core'
import { FeeCalculation } from '@/db/schema/feeCalculations'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { createFeeCalculationForCheckoutSession } from '@/utils/bookkeeping/fees/checkoutSession'
import { feeReadyCheckoutSessionSelectSchema } from '@/db/schema/checkoutSessions'
import {
  calculateTotalDueAmount,
  calculateTotalFeeAmount,
  finalizeFeeCalculation,
} from '@/utils/bookkeeping/fees/common'
import { DbTransaction } from '@/db/types'
import { createCustomerBookkeeping } from '@/utils/bookkeeping'
import { TransactionOutput } from '@/db/transactionEnhacementTypes'
import { Event } from '@/db/schema/events'
import { LedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'

export const confirmCheckoutSessionTransaction = async (
  input: { id: string },
  transaction: DbTransaction
): Promise<TransactionOutput<{ customer: Customer.Record }>> => {
  try {
    // Find purchase session
    const checkoutSession = await selectCheckoutSessionById(
      input.id,
      transaction
    )
    if (!checkoutSession) {
      throw new Error(`Purchase session not found: ${input.id}`)
    }
    if (checkoutSession.status !== CheckoutSessionStatus.Open) {
      throw new Error(`Checkout session is not open: ${input.id}`)
    }
    let finalFeeCalculation: FeeCalculation.Record | null =
      await selectLatestFeeCalculation(
        {
          checkoutSessionId: checkoutSession.id,
        },
        transaction
      )

    if (
      !finalFeeCalculation &&
      checkoutSession.type !== CheckoutSessionType.AddPaymentMethod
    ) {
      const feeReadySession =
        feeReadyCheckoutSessionSelectSchema.parse(checkoutSession)
      finalFeeCalculation =
        await createFeeCalculationForCheckoutSession(
          feeReadySession,
          transaction
        )
    }

    let customer: Customer.Record | null = null
    let customerEvents: Event.Insert[] = []
    let customerLedgerCommand: LedgerCommand | undefined = undefined

    if (checkoutSession.customerId) {
      // Find customer
      customer = await selectCustomerById(
        checkoutSession.customerId,
        transaction
      )
    } else if (checkoutSession.purchaseId) {
      const purchaseAndCustomer =
        await selectPurchaseAndCustomersByPurchaseWhere(
          {
            id: checkoutSession.purchaseId!,
          },
          transaction
        )
      customer = purchaseAndCustomer[0].customer
    }

    if (!customer) {
      if (!checkoutSession.customerEmail) {
        throw new Error(
          `Checkout session has no customer email, and no purchase: ${input.id}`
        )
      }
      const customerResult = await createCustomerBookkeeping(
        {
          customer: {
            email: checkoutSession.customerEmail,
            organizationId: checkoutSession.organizationId,
            name:
              checkoutSession.customerName ||
              checkoutSession.billingAddress?.name ||
              checkoutSession.customerEmail,
            billingAddress: checkoutSession.billingAddress,
            externalId: core.nanoid(),
          },
        },
        {
          transaction,
          organizationId: checkoutSession.organizationId,
          livemode: checkoutSession.livemode,
        }
      )

      customer = customerResult.result.customer

      // Store events/ledger from customer creation to bubble up
      customerEvents = customerResult.eventsToInsert || []
      customerLedgerCommand = customerResult.ledgerCommand
    }
    /**
     * Set the customer id if the checkout session doesn't have one,
     * (or, defensively, if the checkoutsession's customer id doesn't match the customer id)
     */
    if (customer.id !== checkoutSession.customerId) {
      await updateCheckoutSession(
        {
          ...checkoutSession,
          customerId: customer.id,
        },
        transaction
      )
    }

    let stripeCustomerId: string | null = customer.stripeCustomerId
    if (!stripeCustomerId) {
      if (!checkoutSession.customerEmail) {
        throw new Error(
          `Checkout session has no customer email: ${input.id}`
        )
      }
      // Create stripe customer if customer exists but has no stripe ID
      const stripeCustomer = await createStripeCustomer({
        email: checkoutSession.customerEmail,
        name:
          checkoutSession.customerName ||
          checkoutSession.customerEmail,
        livemode: checkoutSession.livemode,
      })
      stripeCustomerId = stripeCustomer.id

      // Update existing customer with stripe ID
      customer = await updateCustomer(
        {
          id: customer.id,
          stripeCustomerId,
        },
        transaction
      )
    }

    if (checkoutSession.stripeSetupIntentId) {
      const setupIntent = await getSetupIntent(
        checkoutSession.stripeSetupIntentId
      )
      if (!setupIntent.customer) {
        await updateSetupIntent(
          checkoutSession.stripeSetupIntentId,
          {
            customer: stripeCustomerId,
          },
          checkoutSession.livemode
        )
      }
    } else if (
      checkoutSession.stripePaymentIntentId &&
      checkoutSession.type !== CheckoutSessionType.AddPaymentMethod &&
      finalFeeCalculation
    ) {
      const finalizedFeeCalculation = await finalizeFeeCalculation(
        finalFeeCalculation,
        transaction
      )

      const finalFeeAmount = calculateTotalFeeAmount(
        finalizedFeeCalculation
      )

      const totalAmountDue = calculateTotalDueAmount(
        finalizedFeeCalculation
      )

      await updatePaymentIntent(
        checkoutSession.stripePaymentIntentId,
        {
          customer: stripeCustomerId,
          amount: totalAmountDue,
          application_fee_amount:
            totalAmountDue > 0 ? finalFeeAmount : undefined,
        },
        checkoutSession.livemode
      )
    }
    return {
      result: {
        customer,
      },
      eventsToInsert:
        customerEvents.length > 0 ? customerEvents : undefined,
      ledgerCommand: customerLedgerCommand,
    }
  } catch (error) {
    core.error(error)
    throw error
  }
}
