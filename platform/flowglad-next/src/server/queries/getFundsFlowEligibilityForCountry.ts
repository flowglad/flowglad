import { z } from 'zod'
import { protectedProcedure } from '@/server/trpc'
import { StripeConnectContractType } from '@/types'
import { getEligibleFundsFlowsForCountry } from '@/utils/countries'

export const getFundsFlowEligibilityForCountry = protectedProcedure
  .input(
    z.object({
      countryCode: z.string(),
    })
  )
  .output(
    z.object({
      eligibleFlows: z.array(z.nativeEnum(StripeConnectContractType)),
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
