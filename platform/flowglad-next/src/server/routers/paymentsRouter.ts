import { z } from 'zod'
import {
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import {
  paymentsClientSelectSchema,
  paymentsPaginatedListSchema,
  paymentsPaginatedSelectSchema,
  paymentsPaginatedTableRowDataSchema,
  paymentsTableRowDataSchema,
} from '@/db/schema/payments'
import {
  selectPaymentById,
  selectPaymentCountsByStatus,
  selectPaymentsCursorPaginatedWithTableRowData,
  selectPaymentsPaginated,
} from '@/db/tableMethods/paymentMethods'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@/db/tableUtils'
import { refundPayment } from '@/server/mutations/refundPayment'
import { protectedProcedure, router } from '@/server/trpc'
import { PaymentStatus } from '@/types'
import {
  generateOpenApiMetas,
  type RouteConfig,
} from '@/utils/openapi'
import { retryPaymentTransaction } from '@/utils/paymentHelpers'

const { openApiMetas, routeConfigs } = generateOpenApiMetas({
  resource: 'Payment',
  tags: ['Payments'],
})

export const paymentsRouteConfigs = routeConfigs

export const refundPaymentRouteConfig: Record<string, RouteConfig> = {
  'POST /payments/:id/refund': {
    procedure: 'payments.refund',
    pattern: /^payments\/([^\\/]+)\/refund$/,
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
    const paymentResult = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectPaymentById(input.id, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return { payment: paymentResult.unwrap() }
  })

const getTableRowsProcedure = protectedProcedure
  .input(
    createPaginatedTableRowInputSchema(
      z.object({
        status: z.enum(PaymentStatus).optional(),
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
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        return selectPaymentsCursorPaginatedWithTableRowData({
          input,
          transaction,
        })
      }
    )
  )

const getCountsByStatusProcedure = protectedProcedure
  .input(z.object({}))
  .output(
    z.array(
      z.object({
        status: z.enum(PaymentStatus),
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
