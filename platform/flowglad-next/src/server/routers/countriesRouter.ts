import { selectCountries } from '@/db/tableMethods/countryMethods'
import { adminTransaction } from '@/db/adminTransaction'
import { protectedProcedure, router } from '../trpc'
import { z } from 'zod'
import { countriesSelectSchema } from '@/db/schema/countries'

const listCountries = protectedProcedure
  .output(
    z.object({
      countries: z.array(countriesSelectSchema),
    })
  )
  .query(async () => {
    const countries = await adminTransaction(
      async ({ transaction }) => {
        return selectCountries({}, transaction)
      }
    )
    return {
      countries,
    }
  })

export const countriesRouter = router({
  list: listCountries,
})
