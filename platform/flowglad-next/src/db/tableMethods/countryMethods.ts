import {
  countries,
  countriesInsertSchema,
  countriesSelectSchema,
  countriesUpdateSchema,
  Country,
} from '@/db/schema/countries'
import {
  createSelectById,
  createSelectFunction,
  ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import { DbTransaction } from '@/db/types'

const config: ORMMethodCreatorConfig<
  typeof countries,
  typeof countriesSelectSchema,
  typeof countriesInsertSchema,
  typeof countriesUpdateSchema
> = {
  selectSchema: countriesSelectSchema,
  insertSchema: countriesInsertSchema,
  updateSchema: countriesUpdateSchema,
  tableName: 'countries',
}

export const selectCountryById = createSelectById(countries, config)

export const selectCountries = createSelectFunction(countries, config)

export const selectAllCountries = async (
  transaction: DbTransaction
): Promise<Country.Record[]> => {
  const result = await transaction.select().from(countries)
  return result.map((item) => countriesSelectSchema.parse(item))
}
