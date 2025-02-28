import { z } from 'zod'
import { protectedProcedure, router } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import {
  insertPurchaseSession,
  selectPurchaseSessionById,
  selectPurchaseSessions,
  selectPurchaseSessionsPaginated,
  updatePurchaseSession,
} from '@/db/tableMethods/purchaseSessionMethods'
import { selectCustomerProfiles } from '@/db/tableMethods/customerProfileMethods'
import { PurchaseSessionStatus } from '@/types'
import { PriceType } from '@/types'
import { TRPCError } from '@trpc/server'
import {
  editPurchaseSessionInputSchema,
  purchaseSessionClientSelectSchema,
  purchaseSessionsPaginatedListSchema,
  purchaseSessionsPaginatedSelectSchema,
} from '@/db/schema/purchaseSessions'
import { generateOpenApiMetas } from '@/utils/openapi'
import { selectVariantProductAndOrganizationByVariantWhere } from '@/db/tableMethods/variantMethods'
import {
  createPaymentIntentForPurchaseSession,
  createSetupIntentForPurchaseSession,
} from '@/utils/stripe'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'purchaseSession',
  pluralResource: 'purchaseSessions',
  tags: ['Purchase Sessions', 'Purchases', 'Customer Profiles'],
})

export const purchaseSessionsRouteConfigs = routeConfigs

const createPurchaseSessionSchema = z.object({
  customerProfileExternalId: z
    .string()
    .describe(
      'The id of the CustomerProfile for this purchase session, as defined in your system'
    ),
  VariantId: z
    .string()
    .describe('The ID of the variant the customer shall purchase'),
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

const singlePurchaseSessionOutputSchema = z.object({
  purchaseSession: purchaseSessionClientSelectSchema,
  url: z
    .string()
    .describe('The URL to redirect to complete the purchase'),
})

export const createPurchaseSession = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createPurchaseSessionSchema)
  .output(singlePurchaseSessionOutputSchema)
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction, livemode }) => {
        const OrganizationId = ctx.OrganizationId
        if (!OrganizationId) {
          throw new Error('OrganizationId is required')
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
        const [{ variant, product, organization }] =
          await selectVariantProductAndOrganizationByVariantWhere(
            { id: input.VariantId },
            transaction
          )
        const purchaseSession = await insertPurchaseSession(
          {
            CustomerProfileId: customerProfile.id,
            VariantId: input.VariantId,
            OrganizationId,
            customerEmail: customerProfile.email,
            customerName: customerProfile.name,
            status: PurchaseSessionStatus.Open,
            livemode,
            successUrl: input.successUrl,
            cancelUrl: input.cancelUrl,
          },
          transaction
        )

        let stripeSetupIntentId: string | null = null
        let stripePaymentIntentId: string | null = null
        if (variant.priceType === PriceType.Subscription) {
          const stripeSetupIntent =
            await createSetupIntentForPurchaseSession({
              variant,
              product,
              organization,
              purchaseSession,
            })
          stripeSetupIntentId = stripeSetupIntent.id
        } else if (variant.priceType === PriceType.SinglePayment) {
          const stripePaymentIntent =
            await createPaymentIntentForPurchaseSession({
              variant,
              product,
              organization,
              purchaseSession,
            })
          stripePaymentIntentId = stripePaymentIntent.id
        }
        const updatedPurchaseSession = await updatePurchaseSession(
          {
            id: purchaseSession.id,
            stripeSetupIntentId,
            stripePaymentIntentId,
          },
          transaction
        )
        return {
          purchaseSession: updatedPurchaseSession,
          url: `${process.env.NEXT_PUBLIC_APP_URL}/purchase-session/${purchaseSession.id}`,
        }
      },
      { apiKey: ctx.apiKey }
    )
  })

export const editPurchaseSession = protectedProcedure
  //   .meta(openApiMetas.PUT)
  .input(editPurchaseSessionInputSchema)
  .output(singlePurchaseSessionOutputSchema)
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        const OrganizationId = ctx.OrganizationId
        if (!OrganizationId) {
          throw new Error('OrganizationId is required')
        }
        const [purchaseSession] = await selectPurchaseSessions(
          {
            id: input.purchaseSession.id,
          },
          transaction
        )
        if (!purchaseSession) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Purchase session not found for id: ${input.purchaseSession.id}`,
          })
        }

        if (purchaseSession.status !== PurchaseSessionStatus.Open) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Purchase session ${input.purchaseSession.id} is in status ${purchaseSession.status}. Purchase sessions can only be edited while in status ${PurchaseSessionStatus.Open}.`,
          })
        }

        const updatedPurchaseSession = await updatePurchaseSession(
          input.purchaseSession,
          transaction
        )
        if (!updatedPurchaseSession) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to update purchase session for id: ${input.purchaseSession.id}`,
          })
        }
        return {
          purchaseSession: updatedPurchaseSession,
          url: `${process.env.NEXT_PUBLIC_APP_URL}/purchase-session/${updatedPurchaseSession.id}`,
        }
      },
      { apiKey: ctx.apiKey }
    )
  })

const getPurchaseSessionProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(z.object({ id: z.string() }))
  .output(singlePurchaseSessionOutputSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      const purchaseSession = await selectPurchaseSessionById(
        input.id,
        transaction
      )
      return {
        purchaseSession,
        url: `${process.env.NEXT_PUBLIC_APP_URL}/purchase-session/${purchaseSession.id}`,
      }
    })
  })

const listPurchaseSessionsProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(purchaseSessionsPaginatedSelectSchema)
  .output(purchaseSessionsPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      return selectPurchaseSessionsPaginated(input, transaction)
    })
  })

export const purchaseSessionsRouter = router({
  create: createPurchaseSession,
  edit: editPurchaseSession,
  get: getPurchaseSessionProcedure,
  list: listPurchaseSessionsProcedure,
})
