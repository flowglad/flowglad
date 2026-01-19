import { feeReadyCheckoutSessionSelectSchema } from '@/db/schema/checkoutSessions'
import type { Customer } from '@/db/schema/customers'
import type { FeeCalculation } from '@/db/schema/feeCalculations'
import {
  selectCheckoutSessionById,
  updateCheckoutSession,
} from '@/db/tableMethods/checkoutSessionMethods'
import {
  selectCustomerById,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { selectPurchaseAndCustomersByPurchaseWhere } from '@/db/tableMethods/purchaseMethods'
import type { TransactionEffectsContext } from '@/db/types'
import { CheckoutSessionStatus, CheckoutSessionType } from '@/types'
import { createCustomerBookkeeping } from '@/utils/bookkeeping'
import { createFeeCalculationForCheckoutSession } from '@/utils/bookkeeping/fees/checkoutSession'
import {
  calculateTotalDueAmount,
  calculateTotalFeeAmount,
  finalizeFeeCalculation,
} from '@/utils/bookkeeping/fees/common'
import core from '@/utils/core'
import {
  cancelPaymentIntent,
  createStripeCustomer,
  getPaymentIntent,
  getSetupIntent,
  updatePaymentIntent,
  updateSetupIntent,
} from '@/utils/stripe'

export const confirmCheckoutSessionTransaction = async (
  input: { id: string; savePaymentMethodForFuture?: boolean },
  ctx: TransactionEffectsContext
): Promise<{ customer: Customer.Record }> => {
  const { transaction, emitEvent, enqueueLedgerCommand } = ctx
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
          cacheRecomputationContext: ctx.cacheRecomputationContext,
          organizationId: checkoutSession.organizationId,
          livemode: checkoutSession.livemode,
          invalidateCache: ctx.invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }
      )

      customer = customerResult.customer
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
        organizationId: checkoutSession.organizationId,
        name:
          checkoutSession.customerName ||
          checkoutSession.customerEmail,
        livemode: checkoutSession.livemode,
        createdBy: 'confirmCheckoutSession',
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

      const totalAmountDue = calculateTotalDueAmount(
        finalizedFeeCalculation
      )

      // Handle zero-total checkouts (e.g., 100% discount applied)
      // Cancel the PaymentIntent since we can't charge $0 through Stripe
      // FIXME: If input.savePaymentMethodForFuture is true, we should create a SetupIntent
      // to save the card instead of just canceling the PaymentIntent. Currently the card
      // data is lost when the PaymentIntent is canceled in this edge case.
      if (totalAmountDue === 0) {
        await cancelPaymentIntent(
          checkoutSession.stripePaymentIntentId,
          checkoutSession.livemode
        )
        // Clear the PaymentIntent ID from the checkout session
        await updateCheckoutSession(
          {
            ...checkoutSession,
            customerId: customer.id,
            stripePaymentIntentId: null,
          },
          transaction
        )
      } else {
        const finalFeeAmount = calculateTotalFeeAmount(
          finalizedFeeCalculation
        )

        const paymentIntent = await getPaymentIntent(
          checkoutSession.stripePaymentIntentId
        )

        await updatePaymentIntent(
          checkoutSession.stripePaymentIntentId,
          {
            ...(paymentIntent.customer
              ? {}
              : { customer: stripeCustomerId }),
            amount: totalAmountDue,
            application_fee_amount: finalFeeAmount,
            // Set setup_future_usage if user consented to save payment method for future checkouts
            ...(input.savePaymentMethodForFuture
              ? { setup_future_usage: 'on_session' as const }
              : {}),
          },
          checkoutSession.livemode
        )
      }
    }
    return { customer }
  } catch (error) {
    core.error(error)
    throw error
  }
}
