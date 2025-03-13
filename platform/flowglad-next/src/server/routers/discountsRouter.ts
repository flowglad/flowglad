import { router } from '../trpc'
import { editDiscountInputSchema } from '@/db/schema/discounts'
import {
  selectDiscountById,
  updateDiscount,
} from '@/db/tableMethods/discountMethods'
import { updateStripeCouponFromDiscountRecord } from '@/utils/stripe'
import { attemptDiscountCode } from '@/server/mutations/attemptDiscountCode'
import { clearDiscountCode } from '@/server/mutations/clearDiscountCode'
import { generateOpenApiMetas, trpcToRest } from '@/utils/openapi'
import {
  discountClientSelectSchema,
  discountsPaginatedSelectSchema,
  discountsPaginatedListSchema,
} from '@/db/schema/discounts'

import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { createDiscountInputSchema } from '@/db/schema/discounts'
import {
  insertDiscount,
  selectDiscountsPaginated,
} from '@/db/tableMethods/discountMethods'
import { idInputSchema } from '@/db/tableUtils'
import { deleteDiscount as deleteDiscountMethod } from '@/db/tableMethods/discountMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { createStripeCouponFromDiscountInsert } from '@/utils/stripe'
import { z } from 'zod'

const { openApiMetas } = generateOpenApiMetas({
  resource: 'Discount',
  tags: ['Discounts'],
})

export const createDiscount = protectedProcedure
  .meta(openApiMetas.POST)
  .input(createDiscountInputSchema)
  .output(z.object({ discount: discountClientSelectSchema }))
  .mutation(async ({ input, ctx }) => {
    const discount = await authenticatedTransaction(
      async ({ transaction, userId, livemode }) => {
        const [{ organization }] =
          await selectMembershipAndOrganizations(
            {
              userId,
              focused: true,
            },
            transaction
          )
        const stripeCoupon =
          await createStripeCouponFromDiscountInsert(
            input.discount,
            ctx.environment === 'live'
          )
        return insertDiscount(
          {
            ...input.discount,
            organizationId: organization.id,
            stripeCouponId: stripeCoupon.id,
            livemode,
          },
          transaction
        )
      }
    )
    return { discount }
  })

export const discountsRouteConfigs = {
  ...trpcToRest('discounts.create'),
  ...trpcToRest('discounts.update'),
  ...trpcToRest('discounts.get'),
  // ...trpcToRest('discounts.delete'),
  // ...trpcToRest('discounts.attempt'),
  // ...trpcToRest('discounts.clear'),
  ...trpcToRest('discounts.list'),
}

const listDiscountsProcedure = protectedProcedure
  .meta(openApiMetas.LIST)
  .input(discountsPaginatedSelectSchema)
  .output(discountsPaginatedListSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        return selectDiscountsPaginated(input, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const editDiscount = protectedProcedure
  .meta(openApiMetas.PUT)
  .input(editDiscountInputSchema)
  .output(z.object({ discount: discountClientSelectSchema }))
  .mutation(async ({ input, ctx }) => {
    const discount = await authenticatedTransaction(
      async ({ transaction }) => {
        const updatedDiscount = await updateDiscount(
          {
            ...input.discount,
            id: input.id,
          },
          transaction
        )
        await updateStripeCouponFromDiscountRecord(
          updatedDiscount,
          ctx.livemode
        )
        return updatedDiscount
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return { discount }
  })

export const deleteDiscount = protectedProcedure
  .input(idInputSchema)
  .mutation(async ({ input, ctx }) => {
    const { id } = input
    await authenticatedTransaction(
      ({ transaction }) => deleteDiscountMethod(id, transaction),
      {
        apiKey: ctx.apiKey,
      }
    )
    return { success: true }
  })

export const getDiscount = protectedProcedure
  .meta(openApiMetas.GET)
  .input(idInputSchema)
  .output(z.object({ discount: discountClientSelectSchema }))
  .query(async ({ input, ctx }) => {
    const discount = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectDiscountById(input.id, transaction)
      },
      { apiKey: ctx.apiKey }
    )
    return { discount }
  })

export const discountsRouter = router({
  get: getDiscount,
  create: createDiscount,
  update: editDiscount,
  delete: deleteDiscount,
  attempt: attemptDiscountCode,
  clear: clearDiscountCode,
  list: listDiscountsProcedure,
})
