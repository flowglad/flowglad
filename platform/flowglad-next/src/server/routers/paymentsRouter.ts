import { PaymentStatus } from '@db-core/enums'
import {
  paymentsClientSelectSchema,
  paymentsPaginatedListSchema,
  paymentsPaginatedSelectSchema,
  paymentsPaginatedTableRowDataSchema,
  paymentsTableRowDataSchema,
} from '@db-core/schema/payments'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
  idInputSchema,
} from '@db-core/tableUtils'
import { Result } from 'better-result'
import { z } from 'zod'
import {
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import {
  selectPaymentById,
  selectPaymentCountsByStatus,
  selectPaymentsCursorPaginatedWithTableRowData,
  selectPaymentsPaginated,
} from '@/db/tableMethods/paymentMethods'
import { refundPayment } from '@/server/mutations/refundPayment'
import { protectedProcedure, router } from '@/server/trpc'
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
    return (
      await authenticatedTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await selectPaymentsPaginated(input, transaction)
          )
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
  })

const getPaymentProcedure = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ payment: paymentsClientSelectSchema }))
  .query(async ({ ctx, input }) => {
    const payment = (
      await authenticatedTransaction(
        async ({ transaction }) => {
          return Result.ok(
            (await selectPaymentById(input.id, transaction)).unwrap()
          )
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
    return { payment }
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
        return await selectPaymentsCursorPaginatedWithTableRowData({
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
    return (
      await authenticatedTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await selectPaymentCountsByStatus(transaction)
          )
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
  })

export const retryPayment = protectedProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    return (
      await authenticatedTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await retryPaymentTransaction(input, transaction)
          )
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    ).unwrap()
  })

export const paymentsRouter = router({
  refund: refundPayment,
  list: listPaymentsProcedure,
  get: getPaymentProcedure,
  getTableRows: getTableRowsProcedure,
  getCountsByStatus: getCountsByStatusProcedure,
  retry: retryPayment,
})
