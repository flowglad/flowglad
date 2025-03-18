import { publicProcedure } from '@/server/trpc'
import { adminTransaction } from '@/db/databaseMethods'
import { z } from 'zod'
import {
  selectCheckoutSessionById,
  selectCheckoutSessions,
} from '@/db/tableMethods/checkoutSessionMethods'
import {
  selectCustomerProfiles,
  insertCustomerProfile,
  updateCustomerProfile,
} from '@/db/tableMethods/customerProfileMethods'
import {
  createStripeCustomer,
  updatePaymentIntent,
  updateSetupIntent,
} from '@/utils/stripe'
import { upsertCustomerByEmail } from '@/db/tableMethods/customerMethods'
import { CheckoutSessionStatus } from '@/types'
import { CustomerProfile } from '@/db/schema/customerProfiles'
import { selectPurchasesCustomerProfileAndCustomer } from '@/db/tableMethods/purchaseMethods'
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
 * Idempotently creates a stripe customer and customer profile for a purchase session,
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

      let customerProfile: CustomerProfile.Record | null = null
      if (checkoutSession.customerEmail) {
        // Find customer profile
        const result = await selectCustomerProfiles(
          {
            email: checkoutSession.customerEmail,
            organizationId: checkoutSession.organizationId,
          },
          transaction
        )
        customerProfile = result[0]
      } else if (checkoutSession.purchaseId) {
        const purchaseAndCustomerProfile =
          await selectPurchasesCustomerProfileAndCustomer(
            {
              id: checkoutSession.purchaseId!,
            },
            transaction
          )
        customerProfile =
          purchaseAndCustomerProfile[0].customerProfile
      }

      if (!customerProfile) {
        if (!checkoutSession.customerEmail) {
          throw new Error(
            `Purchase session has no customer email, and no purchase: ${input.id}`
          )
        }
        const [customer] = await upsertCustomerByEmail(
          {
            email: checkoutSession.customerEmail,
            name:
              checkoutSession.customerName ||
              checkoutSession.customerEmail,
            billingAddress: null,
            livemode: checkoutSession.livemode,
          },
          transaction
        )
        // Create new customer profile
        customerProfile = await insertCustomerProfile(
          {
            customerId: customer.id,
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

      let stripeCustomerId: string | null =
        customerProfile.stripeCustomerId
      if (!stripeCustomerId) {
        if (!checkoutSession.customerEmail) {
          throw new Error(
            `Purchase session has no customer email: ${input.id}`
          )
        }
        // Create stripe customer if profile exists but has no stripe ID
        const stripeCustomer = await createStripeCustomer({
          email: checkoutSession.customerEmail,
          name:
            checkoutSession.customerName ||
            checkoutSession.customerEmail,
          livemode: checkoutSession.livemode,
        })
        stripeCustomerId = stripeCustomer.id

        // Update existing profile with stripe ID
        customerProfile = await updateCustomerProfile(
          {
            id: customerProfile.id,
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
        customerProfile,
      }
    })
  })
