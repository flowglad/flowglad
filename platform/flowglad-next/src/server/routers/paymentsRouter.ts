import { protectedProcedure, router } from '@/server/trpc'
import { refundPayment } from '@/server/mutations/refundPayment'
import {
  paymentsClientSelectSchema,
  paymentsPaginatedListSchema,
  paymentsPaginatedSelectSchema,
} from '@/db/schema/payments'
import { authenticatedTransaction } from '@/db/databaseMethods'
import {
  selectPaymentById,
  selectPaymentsPaginated,
} from '@/db/tableMethods/paymentMethods'
import { idInputSchema } from '@/db/tableUtils'
import { generateOpenApiMetas, RouteConfig } from '@/utils/openapi'
import { z } from 'zod'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'Payment',
  tags: ['Payments'],
})

export const paymentsRouteConfigs = routeConfigs

export const refundPaymentRouteConfig: Record<string, RouteConfig> = {
  'POST /payments/:id/refund': {
    procedure: 'payments.refund',
    pattern: new RegExp(`^payments\/([^\\/]+)\/refund$`),
    mapParams: (matches) => ({ id: matches[0] }),
  },
}

const listPaymentsProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(paymentsPaginatedSelectSchema)
  .output(paymentsPaginatedListSchema)
  .query(async ({ ctx, input }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      return selectPaymentsPaginated(input, transaction)
    })
  })

const getPaymentProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ payment: paymentsClientSelectSchema }))
  .query(async ({ ctx, input }) => {
    const payment = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectPaymentById(input.id, transaction)
      }
    )
    return { payment }
  })

export const paymentsRouter = router({
  refund: refundPayment,
  list: listPaymentsProcedure,
  get: getPaymentProcedure,
})
