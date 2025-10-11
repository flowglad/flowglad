import { z } from 'zod'
import {
  protectedProcedure,
  publicProcedure,
  router,
} from '@/server/trpc'
import {
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import { setCheckoutSessionCookie } from '@/server/mutations/setCheckoutSessionCookie'
import {
  selectCheckoutSessionById,
  selectCheckoutSessions,
  selectCheckoutSessionsPaginated,
  updateCheckoutSession as updateCheckoutSessionDb,
  updateCheckoutSessionAutomaticallyUpdateSubscriptions,
  updateCheckoutSessionBillingAddress,
  updateCheckoutSessionCustomerEmail,
  updateCheckoutSessionPaymentMethodType,
} from '@/db/tableMethods/checkoutSessionMethods'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  PaymentMethodType,
} from '@/types'
import { TRPCError } from '@trpc/server'
import {
  editCheckoutSessionInputSchema,
  CheckoutSession,
  checkoutSessionsPaginatedListSchema,
  checkoutSessionsPaginatedSelectSchema,
  getIntentStatusInputSchema,
  singleCheckoutSessionOutputSchema,
  createCheckoutSessionSchema,
} from '@/db/schema/checkoutSessions'
import { generateOpenApiMetas } from '@/utils/openapi'
import { billingAddressSchema } from '@/db/schema/organizations'
import { adminTransaction } from '@/db/adminTransaction'
import { getIntentStatus } from '@/utils/bookkeeping/intentStatus'
import { createCheckoutSessionTransaction } from '@/utils/bookkeeping/createCheckoutSession'
import { attemptDiscountCode } from '@/server/mutations/attemptDiscountCode'
import { clearDiscountCode } from '@/server/mutations/clearDiscountCode'
import { confirmCheckoutSession } from '@/server/mutations/confirmCheckoutSession'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'checkoutSession',
  pluralResource: 'checkoutSessions',
  tags: ['Checkout Sessions', 'Purchases'],
})

export const checkoutSessionsRouteConfigs = routeConfigs

export const createCheckoutSession = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createCheckoutSessionSchema)
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
          url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/${updatedCheckoutSession.id}`,
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
          url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/${checkoutSession.id}`,
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

export const getIntentStatusProcedure = protectedProcedure
  .input(getIntentStatusInputSchema)
  .query(async ({ input, ctx }) => {
    return adminTransaction(async ({ transaction }) => {
      return getIntentStatus(input, transaction)
    })
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
  .mutation(async ({ input, ctx }) => {
    return adminTransaction(async ({ transaction }) => {
      const checkoutSession =
        await updateCheckoutSessionBillingAddress(input, transaction)
      return {
        checkoutSession,
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
  getIntentStatus: getIntentStatusProcedure,
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
