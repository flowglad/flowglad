import { revalidatePath } from 'next/cache'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { createPurchaseFormSchema } from '@/db/schema/purchases'
import { createOpenPurchase } from '@/utils/bookkeeping'
import { protectedProcedure } from '../trpc'

export const createPurchase = protectedProcedure
  .input(createPurchaseFormSchema)
  .meta({
    description: 'Create an open purchase record for known customer',
    examples: [
      'Create an open purchase',
      'Create a payment link',
      'Create a custom payment link',
    ],
  })
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction, userId, livemode, organizationId }) => {
        const { purchase } = input

        const createdPurchase = await createOpenPurchase(purchase, {
          transaction,
          userId,
          livemode,
          organizationId,
        })

        if (!createdPurchase) {
          throw new Error('Purchase creation failed')
        }
        if (ctx.path) {
          await revalidatePath(ctx.path)
        }
        return {
          data: createdPurchase,
        }
      }
    )
  })
