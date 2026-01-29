import { StripeConnectContractType } from '@db-core/enums'
import { z } from 'zod'
import { countryCodeSchema } from '@/db/commonZodSchema'
import { protectedProcedure } from '@/server/trpc'
import { getEligibleFundsFlowsForCountry } from '@/utils/countries'

export const getFundsFlowEligibilityForCountry = protectedProcedure
  .input(
    z.object({
      countryCode: countryCodeSchema,
    })
  )
  .output(
    z.object({
      eligibleFlows: z.array(z.enum(StripeConnectContractType)),
      isEligible: z.boolean(),
    })
  )
  .query(({ input }) => {
    const eligibleFlows = getEligibleFundsFlowsForCountry(
      input.countryCode
    )

    return {
      eligibleFlows,
      isEligible: eligibleFlows.length > 0,
    }
  })
