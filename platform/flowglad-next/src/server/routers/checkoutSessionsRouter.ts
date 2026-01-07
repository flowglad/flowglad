import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import {
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import {
  type CheckoutSession,
  checkoutSessionsPaginatedListSchema,
  checkoutSessionsPaginatedSelectSchema,
  checkoutSessionsSelectSchema,
  createCheckoutSessionInputSchema,
  editCheckoutSessionInputSchema,
  singleCheckoutSessionOutputSchema,
} from '@/db/schema/checkoutSessions'
import { customerFacingFeeCalculationSelectSchema } from '@/db/schema/feeCalculations'
import { billingAddressSchema } from '@/db/schema/organizations'
import {
  selectCheckoutSessionById,
  selectCheckoutSessions,
  selectCheckoutSessionsPaginated,
  updateCheckoutSessionAutomaticallyUpdateSubscriptions,
  updateCheckoutSessionCustomerEmail,
  updateCheckoutSession as updateCheckoutSessionDb,
  updateCheckoutSessionPaymentMethodType,
} from '@/db/tableMethods/checkoutSessionMethods'
import { attemptDiscountCode } from '@/server/mutations/attemptDiscountCode'
import { clearDiscountCode } from '@/server/mutations/clearDiscountCode'
import { confirmCheckoutSession } from '@/server/mutations/confirmCheckoutSession'
import { setCheckoutSessionCookie } from '@/server/mutations/setCheckoutSessionCookie'
import {
  protectedProcedure,
  publicProcedure,
  router,
} from '@/server/trpc'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  PaymentMethodType,
} from '@/types'
import { editCheckoutSessionBillingAddress } from '@/utils/bookkeeping/checkoutSessions'
import { createCheckoutSessionTransaction } from '@/utils/bookkeeping/createCheckoutSession'
import core from '@/utils/core'
import { generateOpenApiMetas } from '@/utils/openapi'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'checkoutSession',
  pluralResource: 'checkoutSessions',
  tags: ['Checkout Sessions', 'Purchases'],
})

export const checkoutSessionsRouteConfigs = routeConfigs

export const createCheckoutSession = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createCheckoutSessionInputSchema)
  .output(singleCheckoutSessionOutputSchema)
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, ctx, transaction }) => {
        const { checkoutSession: checkoutSessionInput } = input
        const checkoutSessionType = checkoutSessionInput.type
        if (
          checkoutSessionType !== CheckoutSessionType.Product &&
          checkoutSessionType !==
            CheckoutSessionType.AddPaymentMethod &&
          checkoutSessionType !==
            CheckoutSessionType.ActivateSubscription
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid checkout session type: ${checkoutSessionType}. Currently only ${CheckoutSessionType.Product}, ${CheckoutSessionType.AddPaymentMethod}, and ${CheckoutSessionType.ActivateSubscription} are supported.`,
          })
        }

        return await createCheckoutSessionTransaction(
          {
            checkoutSessionInput,
            organizationId: ctx.organizationId!,
            livemode: ctx.livemode,
          },
          transaction
        )
      }
    )
  )

export const updateCheckoutSession = protectedProcedure
  //   .meta(openApiMetas.PUT)
  .input(editCheckoutSessionInputSchema)
  .output(singleCheckoutSessionOutputSchema)
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const organizationId = ctx.organizationId
        if (!organizationId) {
          throw new Error('organizationId is required')
        }
        const [checkoutSession] = await selectCheckoutSessions(
          {
            id: input.checkoutSession.id,
          },
          transaction
        )
        if (!checkoutSession) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Purchase session not found for id: ${input.checkoutSession.id}`,
          })
        }

        if (checkoutSession.status !== CheckoutSessionStatus.Open) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Purchase session ${input.checkoutSession.id} is in status ${checkoutSession.status}. Purchase sessions can only be edited while in status ${CheckoutSessionStatus.Open}.`,
          })
        }

        const updatedCheckoutSession = await updateCheckoutSessionDb(
          {
            ...checkoutSession,
            ...input.checkoutSession,
          } as CheckoutSession.Update,
          transaction
        )
        if (!updatedCheckoutSession) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to update purchase session for id: ${input.checkoutSession.id}`,
          })
        }
        return {
          checkoutSession: updatedCheckoutSession,
          url: `${core.NEXT_PUBLIC_APP_URL}/checkout/${updatedCheckoutSession.id}`,
        }
      },
      { apiKey: ctx.apiKey }
    )
  })

const getCheckoutSessionProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(z.object({ id: z.string() }))
  .output(singleCheckoutSessionOutputSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const checkoutSession = await selectCheckoutSessionById(
          input.id,
          transaction
        )
        return {
          checkoutSession,
          url: `${core.NEXT_PUBLIC_APP_URL}/checkout/${checkoutSession.id}`,
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const listCheckoutSessionsProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(checkoutSessionsPaginatedSelectSchema)
  .output(checkoutSessionsPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        return selectCheckoutSessionsPaginated(input, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

/***
 * We need to isolate payment method type updates from other checkout session updates
 * to prevent race conditions caused by Link.
 */
export const setPaymentMethodTypeProcedure = publicProcedure
  .input(
    z.object({
      id: z.string(),
      paymentMethodType: z.nativeEnum(PaymentMethodType),
    })
  )
  .mutation(async ({ input, ctx }) => {
    return adminTransaction(async ({ transaction }) => {
      const checkoutSession =
        await updateCheckoutSessionPaymentMethodType(
          {
            id: input.id,
            paymentMethodType: input.paymentMethodType,
          },
          transaction
        )
      return {
        checkoutSession,
      }
    })
  })

export const setCustomerEmailProcedure = publicProcedure
  .input(z.object({ id: z.string(), customerEmail: z.string() }))
  .mutation(async ({ input, ctx }) => {
    return adminTransaction(async ({ transaction }) => {
      const checkoutSession =
        await updateCheckoutSessionCustomerEmail(input, transaction)
      return {
        checkoutSession,
      }
    })
  })

export const setBillingAddressProcedure = publicProcedure
  .input(
    z.object({ id: z.string(), billingAddress: billingAddressSchema })
  )
  .output(
    z.object({
      checkoutSession: checkoutSessionsSelectSchema,
      feeCalculation:
        customerFacingFeeCalculationSelectSchema.nullable(),
    })
  )
  .mutation(async ({ input }) => {
    return adminTransaction(async ({ transaction }) => {
      const result = await editCheckoutSessionBillingAddress(
        {
          checkoutSessionId: input.id,
          billingAddress: input.billingAddress,
        },
        transaction
      )
      return {
        checkoutSession: result.checkoutSession,
        feeCalculation: result.feeCalculation,
      }
    })
  })

export const setAutomaticallyUpdateSubscriptionsProcedure =
  publicProcedure
    .input(
      z.object({
        id: z.string(),
        automaticallyUpdateSubscriptions: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return adminTransaction(async ({ transaction }) => {
        const checkoutSession =
          await updateCheckoutSessionAutomaticallyUpdateSubscriptions(
            input,
            transaction
          )
        return { checkoutSession }
      })
    })

export const checkoutSessionsRouter = router({
  create: createCheckoutSession,
  update: updateCheckoutSession,
  get: getCheckoutSessionProcedure,
  list: listCheckoutSessionsProcedure,
  public: {
    setPaymentMethodType: setPaymentMethodTypeProcedure,
    setCustomerEmail: setCustomerEmailProcedure,
    setBillingAddress: setBillingAddressProcedure,
    setAutomaticallyUpdateSubscriptions:
      setAutomaticallyUpdateSubscriptionsProcedure,
    attemptDiscountCode,
    clearDiscountCode,
    confirm: confirmCheckoutSession,
    setSession: setCheckoutSessionCookie,
  },
})
