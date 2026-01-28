import { Result } from 'better-result'
import { z } from 'zod'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  paymentMethodClientSelectSchema,
  paymentMethodsPaginatedListSchema,
  paymentMethodsPaginatedSelectSchema,
} from '@/db/schema/paymentMethods'
import {
  selectPaymentMethodById,
  selectPaymentMethodsPaginated,
} from '@/db/tableMethods/paymentMethodMethods'
import { idInputSchema } from '@/db/tableUtils'
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
    const txResult = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await selectPaymentMethodsPaginated(
          input,
          transaction
        )
        return Result.ok(data)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return txResult.unwrap()
  })

const getPaymentMethodProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(
    z.object({ paymentMethod: paymentMethodClientSelectSchema })
  )
  .query(async ({ ctx, input }) => {
    const txResult = await authenticatedTransaction(
      async ({ transaction }) => {
        const paymentMethod = (
          await selectPaymentMethodById(input.id, transaction)
        ).unwrap()
        return Result.ok(paymentMethod)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return { paymentMethod: txResult.unwrap() }
  })

export const paymentMethodsRouter = router({
  list: listPaymentMethodsProcedure,
  get: getPaymentMethodProcedure,
})
