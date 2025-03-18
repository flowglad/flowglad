import { z } from 'zod'
import { protectedProcedure, router } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import {
  insertCheckoutSession,
  selectCheckoutSessionById,
  selectCheckoutSessions,
  selectCheckoutSessionsPaginated,
  updateCheckoutSession,
} from '@/db/tableMethods/checkoutSessionMethods'
import { selectCustomerProfiles } from '@/db/tableMethods/customerProfileMethods'
import { CheckoutSessionStatus, CheckoutSessionType } from '@/types'
import { PriceType } from '@/types'
import { TRPCError } from '@trpc/server'
import {
  editCheckoutSessionInputSchema,
  CheckoutSession,
  checkoutSessionClientSelectSchema,
  checkoutSessionsPaginatedListSchema,
  checkoutSessionsPaginatedSelectSchema,
} from '@/db/schema/checkoutSessions'
import { generateOpenApiMetas } from '@/utils/openapi'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import {
  createPaymentIntentForCheckoutSession,
  createSetupIntentForCheckoutSession,
} from '@/utils/stripe'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'checkoutSession',
  pluralResource: 'checkoutSessions',
  tags: ['Purchase Sessions', 'Purchases', 'Customer Profiles'],
})

export const checkoutSessionsRouteConfigs = routeConfigs

const createCheckoutSessionSchema = z.object({
  customerProfileExternalId: z
    .string()
    .describe(
      'The id of the CustomerProfile for this purchase session, as defined in your system'
    ),
  priceId: z
    .string()
    .describe('The ID of the price the customer shall purchase'),
  successUrl: z
    .string()
    .describe(
      'The URL to redirect to after the purchase is successful'
    ),
  cancelUrl: z
    .string()
    .describe(
      'The URL to redirect to after the purchase is cancelled or fails'
    ),
})

const singleCheckoutSessionOutputSchema = z.object({
  checkoutSession: checkoutSessionClientSelectSchema,
  url: z
    .string()
    .describe('The URL to redirect to complete the purchase'),
})

export const createCheckoutSession = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createCheckoutSessionSchema)
  .output(singleCheckoutSessionOutputSchema)
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction, livemode }) => {
        const organizationId = ctx.organizationId
        if (!organizationId) {
          throw new Error('organizationId is required')
        }
        const [customerProfile] = await selectCustomerProfiles(
          {
            externalId: input.customerProfileExternalId,
          },
          transaction
        )
        if (!customerProfile) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Customer profile not found for externalId: ${input.customerProfileExternalId}`,
          })
        }
        const [{ price, product, organization }] =
          await selectPriceProductAndOrganizationByPriceWhere(
            { id: input.priceId },
            transaction
          )
        // NOTE: invoice and purchase purchase sessions
        // are not supported by API yet.
        const checkoutSession = await insertCheckoutSession(
          {
            customerProfileId: customerProfile.id,
            priceId: input.priceId,
            organizationId,
            customerEmail: customerProfile.email,
            customerName: customerProfile.name,
            status: CheckoutSessionStatus.Open,
            livemode,
            successUrl: input.successUrl,
            cancelUrl: input.cancelUrl,
            invoiceId: null,
            type: CheckoutSessionType.Product,
          } as const,
          transaction
        )

        let stripeSetupIntentId: string | null = null
        let stripePaymentIntentId: string | null = null
        if (price.type === PriceType.Subscription) {
          const stripeSetupIntent =
            await createSetupIntentForCheckoutSession({
              price,
              product,
              organization,
              checkoutSession,
            })
          stripeSetupIntentId = stripeSetupIntent.id
        } else if (price.type === PriceType.SinglePayment) {
          const stripePaymentIntent =
            await createPaymentIntentForCheckoutSession({
              price,
              product,
              organization,
              checkoutSession,
            })
          stripePaymentIntentId = stripePaymentIntent.id
        }
        const updatedCheckoutSession = await updateCheckoutSession(
          {
            id: checkoutSession.id,
            stripeSetupIntentId,
            stripePaymentIntentId,
            invoiceId: null,
            priceId: input.priceId,
            type: CheckoutSessionType.Product,
          },
          transaction
        )
        return {
          checkoutSession: updatedCheckoutSession,
          url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/${checkoutSession.id}`,
        }
      },
      { apiKey: ctx.apiKey }
    )
  })

export const editCheckoutSession = protectedProcedure
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

        const updatedCheckoutSession = await updateCheckoutSession(
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
    return authenticatedTransaction(async ({ transaction }) => {
      const checkoutSession = await selectCheckoutSessionById(
        input.id,
        transaction
      )
      return {
        checkoutSession,
        url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/${checkoutSession.id}`,
      }
    })
  })

const listCheckoutSessionsProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(checkoutSessionsPaginatedSelectSchema)
  .output(checkoutSessionsPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      return selectCheckoutSessionsPaginated(input, transaction)
    })
  })

export const checkoutSessionsRouter = router({
  create: createCheckoutSession,
  edit: editCheckoutSession,
  get: getCheckoutSessionProcedure,
  list: listCheckoutSessionsProcedure,
})
