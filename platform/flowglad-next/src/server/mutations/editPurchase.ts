import { protectedProcedure } from '../trpc'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { editPurchaseFormSchema } from '@/db/schema/purchases'
import { editOpenPurchase } from '@/utils/bookkeeping'
import { revalidatePath } from 'next/cache'

export const editPurchase = protectedProcedure
  .input(editPurchaseFormSchema)
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction, userId, livemode }) => {
        const { purchase } = input
        const updatedPurchase = await editOpenPurchase(purchase, {
          transaction,
          userId,
          livemode,
        })

        if (!updatedPurchase) {
          throw new Error('Purchase update failed')
        }
        if (ctx.path) {
          await revalidatePath(ctx.path)
        }
        return {
          data: updatedPurchase,
        }
      }
    )
  })
