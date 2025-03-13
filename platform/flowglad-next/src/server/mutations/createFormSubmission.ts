import { z } from 'zod'
import { publicProcedure } from '@/server/trpc'

const servicePurchaseIntakeFormSchema = z.object({
  dashboardTypes: z.string(),
  dashboardDesignAssets: z.string(),
  industry: z.string(),
})

export const createFormSubmission = publicProcedure
  .input(servicePurchaseIntakeFormSchema)
  .mutation(async ({ input }) => {
    return {
      success: true,
    }
  })
