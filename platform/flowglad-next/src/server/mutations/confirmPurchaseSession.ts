import { publicProcedure } from '@/server/trpc'
import { adminTransaction } from '@/db/databaseMethods'
import { z } from 'zod'
import {
  selectPurchaseSessionById,
  selectPurchaseSessions,
} from '@/db/tableMethods/purchaseSessionMethods'
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
import { PurchaseSessionStatus } from '@/types'
import { CustomerProfile } from '@/db/schema/customerProfiles'
import { selectPurchasesCustomerProfileAndCustomer } from '@/db/tableMethods/purchaseMethods'
import { idInputSchema } from '@/db/tableUtils'
import core from '@/utils/core'
import { FeeCalculation } from '@/db/schema/feeCalculations'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { createFeeCalculationForPurchaseSession } from '@/utils/bookkeeping/purchaseSessions'
import { feeReadyPurchaseSessionSelectSchema } from '@/db/schema/purchaseSessions'
import {
  calculateTotalDueAmount,
  calculateTotalFeeAmount,
  finalizeFeeCalculation,
} from '@/utils/bookkeeping/fees'

/**
 * Idempotently creates a stripe customer and customer profile for a purchase session,
 * if they don't already exist.
 */
export const confirmPurchaseSession = publicProcedure
  .input(idInputSchema)
  .mutation(async ({ input }) => {
    return adminTransaction(async ({ transaction }) => {
      // Find purchase session
      const purchaseSession = await selectPurchaseSessionById(
        input.id,
        transaction
      )
      if (!purchaseSession) {
        throw new Error(`Purchase session not found: ${input.id}`)
      }
      if (purchaseSession.status !== PurchaseSessionStatus.Open) {
        throw new Error(`Purchase session is not open: ${input.id}`)
      }
      let finalFeeCalculation: FeeCalculation.Record | null =
        await selectLatestFeeCalculation(
          {
            PurchaseSessionId: purchaseSession.id,
          },
          transaction
        )
      if (!finalFeeCalculation) {
        const feeReadySession =
          feeReadyPurchaseSessionSelectSchema.parse(purchaseSession)
        finalFeeCalculation =
          await createFeeCalculationForPurchaseSession(
            feeReadySession,
            transaction
          )
      }

      let customerProfile: CustomerProfile.Record | null = null
      if (purchaseSession.customerEmail) {
        // Find customer profile
        const result = await selectCustomerProfiles(
          {
            email: purchaseSession.customerEmail,
            organizationId: purchaseSession.OrganizationId,
          },
          transaction
        )
        customerProfile = result[0]
      } else if (purchaseSession.PurchaseId) {
        const purchaseAndCustomerProfile =
          await selectPurchasesCustomerProfileAndCustomer(
            {
              id: purchaseSession.PurchaseId!,
            },
            transaction
          )
        customerProfile =
          purchaseAndCustomerProfile[0].customerProfile
      }

      if (!customerProfile) {
        if (!purchaseSession.customerEmail) {
          throw new Error(
            `Purchase session has no customer email, and no purchase: ${input.id}`
          )
        }
        const [customer] = await upsertCustomerByEmail(
          {
            email: purchaseSession.customerEmail,
            name:
              purchaseSession.customerName ||
              purchaseSession.customerEmail,
            billingAddress: null,
            livemode: purchaseSession.livemode,
          },
          transaction
        )
        // Create new customer profile
        customerProfile = await insertCustomerProfile(
          {
            CustomerId: customer.id,
            email: purchaseSession.customerEmail,
            organizationId: purchaseSession.OrganizationId,
            name:
              purchaseSession.customerName ||
              purchaseSession.customerEmail,
            billingAddress: purchaseSession.billingAddress,
            externalId: core.nanoid(),
            livemode: purchaseSession.livemode,
          },
          transaction
        )
      }

      let stripeCustomerId: string | null =
        customerProfile.stripeCustomerId
      if (!stripeCustomerId) {
        if (!purchaseSession.customerEmail) {
          throw new Error(
            `Purchase session has no customer email: ${input.id}`
          )
        }
        // Create stripe customer if profile exists but has no stripe ID
        const stripeCustomer = await createStripeCustomer({
          email: purchaseSession.customerEmail,
          name:
            purchaseSession.customerName ||
            purchaseSession.customerEmail,
          livemode: purchaseSession.livemode,
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
      if (purchaseSession.stripeSetupIntentId) {
        await updateSetupIntent(
          purchaseSession.stripeSetupIntentId,
          {
            customer: stripeCustomerId,
          },
          purchaseSession.livemode
        )
      } else if (purchaseSession.stripePaymentIntentId) {
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
          purchaseSession.stripePaymentIntentId,
          {
            customer: stripeCustomerId,
            amount: totalAmountDue,
            application_fee_amount:
              totalAmountDue > 0 ? finalFeeAmount : undefined,
          },
          purchaseSession.livemode
        )
      }

      return {
        customerProfile,
      }
    })
  })
