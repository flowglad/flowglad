import {
  paymentMethodClientSelectSchema,
  paymentMethodsPaginatedListSchema,
  paymentMethodsPaginatedSelectSchema,
} from '@db-core/schema/paymentMethods'

import { idInputSchema } from '@db-core/tableUtils'
import { Result } from 'better-result'
import { z } from 'zod'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  selectPaymentMethodById,
  selectPaymentMethodsPaginated,
} from '@/db/tableMethods/paymentMethodMethods'
import { protectedProcedure, router } from '@/server/trpc'
import { generateOpenApiMetas } from '@/utils/openapi'
import { unwrapOrThrow } from '@/utils/resultHelpers'

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
    return (
      await authenticatedTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await selectPaymentMethodsPaginated(input, transaction)
          )
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
  })

const getPaymentMethodProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(
    z.object({ paymentMethod: paymentMethodClientSelectSchema })
  )
  .query(async ({ ctx, input }) => {
    const paymentMethod = (
      await authenticatedTransaction(
        async ({ transaction }) => {
          return Result.ok(
            (
              await selectPaymentMethodById(input.id, transaction)
            ).unwrap()
          )
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
    return { paymentMethod }
  })

export const paymentMethodsRouter = router({
  list: listPaymentMethodsProcedure,
  get: getPaymentMethodProcedure,
})
