import { countryCodeSchema } from '@db-core/commonZodSchema'
<<<<<<< HEAD
import { StripeConnectContractType } from '@db-core/enums'
||||||| parent of b097e5ae (Delete original src/db schema utils and update all imports to @db-core)
=======
>>>>>>> b097e5ae (Delete original src/db schema utils and update all imports to @db-core)
import { z } from 'zod'
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
