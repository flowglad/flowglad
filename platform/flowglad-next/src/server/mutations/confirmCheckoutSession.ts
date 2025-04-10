import { publicProcedure } from '@/server/trpc'
import { adminTransaction } from '@/db/adminTransaction'
import { z } from 'zod'
import { selectCheckoutSessionById } from '@/db/tableMethods/checkoutSessionMethods'
import {
  selectCustomers,
  insertCustomer,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import {
  createStripeCustomer,
  updatePaymentIntent,
  updateSetupIntent,
} from '@/utils/stripe'
import { CheckoutSessionStatus } from '@/types'
import { Customer } from '@/db/schema/customers'
import { selectPurchaseAndCustomersByPurchaseWhere } from '@/db/tableMethods/purchaseMethods'
import { idInputSchema } from '@/db/tableUtils'
import core from '@/utils/core'
import { FeeCalculation } from '@/db/schema/feeCalculations'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { createFeeCalculationForCheckoutSession } from '@/utils/bookkeeping/checkoutSessions'
import { feeReadyCheckoutSessionSelectSchema } from '@/db/schema/checkoutSessions'
import {
  calculateTotalDueAmount,
  calculateTotalFeeAmount,
  finalizeFeeCalculation,
} from '@/utils/bookkeeping/fees'

/**
 * Idempotently creates a stripe customer and customer for a purchase session,
 * if they don't already exist.
 */
export const confirmCheckoutSession = publicProcedure
  .input(idInputSchema)
  .mutation(async ({ input }) => {
    return adminTransaction(async ({ transaction }) => {
      // Find purchase session
      const checkoutSession = await selectCheckoutSessionById(
        input.id,
        transaction
      )
      if (!checkoutSession) {
        throw new Error(`Purchase session not found: ${input.id}`)
      }
      if (checkoutSession.status !== CheckoutSessionStatus.Open) {
        throw new Error(`Purchase session is not open: ${input.id}`)
      }
      let finalFeeCalculation: FeeCalculation.Record | null =
        await selectLatestFeeCalculation(
          {
            checkoutSessionId: checkoutSession.id,
          },
          transaction
        )
      if (!finalFeeCalculation) {
        const feeReadySession =
          feeReadyCheckoutSessionSelectSchema.parse(checkoutSession)
        finalFeeCalculation =
          await createFeeCalculationForCheckoutSession(
            feeReadySession,
            transaction
          )
      }

      let customer: Customer.Record | null = null
      if (checkoutSession.customerEmail) {
        // Find customer
        const result = await selectCustomers(
          {
            email: checkoutSession.customerEmail,
            organizationId: checkoutSession.organizationId,
          },
          transaction
        )
        customer = result[0]
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
            `Purchase session has no customer email, and no purchase: ${input.id}`
          )
        }
        // Create new customer
        customer = await insertCustomer(
          {
            email: checkoutSession.customerEmail,
            organizationId: checkoutSession.organizationId,
            name:
              checkoutSession.customerName ||
              checkoutSession.customerEmail,
            billingAddress: checkoutSession.billingAddress,
            externalId: core.nanoid(),
            livemode: checkoutSession.livemode,
          },
          transaction
        )
      }

      let stripeCustomerId: string | null = customer.stripeCustomerId
      if (!stripeCustomerId) {
        if (!checkoutSession.customerEmail) {
          throw new Error(
            `Purchase session has no customer email: ${input.id}`
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

      // Update setup intent if it exists
      if (checkoutSession.stripeSetupIntentId) {
        await updateSetupIntent(
          checkoutSession.stripeSetupIntentId,
          {
            customer: stripeCustomerId,
          },
          checkoutSession.livemode
        )
      } else if (checkoutSession.stripePaymentIntentId) {
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
        customer,
      }
    })
  })
