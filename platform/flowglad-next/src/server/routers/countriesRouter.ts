import { Result } from 'better-result'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { countriesSelectSchema } from '@/db/schema/countries'
import { selectCountries } from '@/db/tableMethods/countryMethods'
import { protectedProcedure, router } from '../trpc'

const listCountries = protectedProcedure
  .output(
    z.object({
      countries: z.array(countriesSelectSchema),
    })
  )
  .query(async () => {
    const txResult = await adminTransaction(
      async ({ transaction }) => {
        const countries = await selectCountries({}, transaction)
        return Result.ok(countries)
      }
    )
    return {
      countries: txResult.unwrap(),
    }
  })

export const countriesRouter = router({
  list: listCountries,
})
