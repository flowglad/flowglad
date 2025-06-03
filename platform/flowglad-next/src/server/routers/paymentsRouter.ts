import { protectedProcedure, router } from '@/server/trpc'
import { refundPayment } from '@/server/mutations/refundPayment'
import {
  paymentsClientSelectSchema,
  paymentsPaginatedListSchema,
  paymentsPaginatedSelectSchema,
  paymentsTableRowDataSchema,
} from '@/db/schema/payments'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  selectPaymentById,
  selectPaymentsPaginated,
  selectPaymentCountsByStatus,
} from '@/db/tableMethods/paymentMethods'
import {
  idInputSchema,
  createPaginatedTableRowOutputSchema,
  createPaginatedTableRowInputSchema,
} from '@/db/tableUtils'
import { generateOpenApiMetas, RouteConfig } from '@/utils/openapi'
import { z } from 'zod'
import { PaymentStatus } from '@/types'
import { retryPaymentTransaction } from '@/utils/paymentHelpers'
import { authenticatedProcedureTransaction } from '@/db/authenticatedTransaction'
import { selectPaymentsCursorPaginatedWithTableRowData } from '@/db/tableMethods/paymentMethods'
import { paymentsPaginatedTableRowDataSchema } from '@/db/schema/payments'

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
    return authenticatedTransaction(
      async ({ transaction }) => {
        return selectPaymentsPaginated(input, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const getPaymentProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ payment: paymentsClientSelectSchema }))
  .query(async ({ ctx, input }) => {
    const payment = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectPaymentById(input.id, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return { payment }
  })

const getTableRowsProcedure = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        status: z.nativeEnum(PaymentStatus).optional(),
        customerId: z.string().optional(),
        subscriptionId: z.string().optional(),
      })
    )
  )
  .output(
    createPaginatedTableRowOutputSchema(paymentsTableRowDataSchema)
  )
  .query(
    authenticatedProcedureTransaction(
      selectPaymentsCursorPaginatedWithTableRowData
    )
  )

const getCountsByStatusProcedure = protectedProcedure
  .input(z.object({}))
  .output(
    z.array(
      z.object({
        status: z.nativeEnum(PaymentStatus),
        count: z.number(),
      })
    )
  )
  .query(async ({ ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        return selectPaymentCountsByStatus(transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const retryPayment = protectedProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        return retryPaymentTransaction(input, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const paymentsRouter = router({
  refund: refundPayment,
  list: listPaymentsProcedure,
  get: getPaymentProcedure,
  getTableRows: getTableRowsProcedure,
  getCountsByStatus: getCountsByStatusProcedure,
  retry: retryPayment,
})
