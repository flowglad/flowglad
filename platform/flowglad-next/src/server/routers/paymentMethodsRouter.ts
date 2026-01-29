import {
  paymentMethodClientSelectSchema,
  paymentMethodsPaginatedListSchema,
  paymentMethodsPaginatedSelectSchema,
} from '@db-core/schema/paymentMethods'
import { idInputSchema } from '@db-core/tableUtils'
import { z } from 'zod'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  selectPaymentMethodById,
  selectPaymentMethodsPaginated,
} from '@/db/tableMethods/paymentMethodMethods'
import { protectedProcedure, router } from '@/server/trpc'
import { generateOpenApiMetas } from '@/utils/openapi'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'PaymentMethod',
  tags: ['Payment Methods'],
})

export const paymentMethodsRouteConfigs = routeConfigs

const listPaymentMethodsProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(paymentMethodsPaginatedSelectSchema)
  .output(paymentMethodsPaginatedListSchema)
  .query(async ({ ctx, input }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        return selectPaymentMethodsPaginated(input, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const getPaymentMethodProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(
    z.object({ paymentMethod: paymentMethodClientSelectSchema })
  )
  .query(async ({ ctx, input }) => {
    const paymentMethod = await authenticatedTransaction(
      async ({ transaction }) => {
        return (
          await selectPaymentMethodById(input.id, transaction)
        ).unwrap()
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return { paymentMethod }
  })

export const paymentMethodsRouter = router({
  list: listPaymentMethodsProcedure,
  get: getPaymentMethodProcedure,
})
