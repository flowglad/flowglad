import { countriesSelectSchema } from '@db-core/schema/countries'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCountries } from '@/db/tableMethods/countryMethods'
import { protectedProcedure, router } from '../trpc'

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
