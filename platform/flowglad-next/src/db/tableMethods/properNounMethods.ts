import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createBulkUpsertFunction,
} from '@/db/tableUtils'
import {
  ProperNoun,
  properNouns,
  properNounsInsertSchema,
  properNounsSelectSchema,
  properNounsUpdateSchema,
} from '@/db/schema/properNouns'
import { DbTransaction } from '@/db/types'
import { ilike, or, sql } from 'drizzle-orm'

const config: ORMMethodCreatorConfig<
  typeof properNouns,
  typeof properNounsSelectSchema,
  typeof properNounsInsertSchema,
  typeof properNounsUpdateSchema
> = {
  selectSchema: properNounsSelectSchema,
  insertSchema: properNounsInsertSchema,
  updateSchema: properNounsUpdateSchema,
  tableName: 'proper_nouns',
}

export const selectProperNounById = createSelectById(
  properNouns,
  config
)

export const insertProperNoun = createInsertFunction(
  properNouns,
  config
)

export const updateProperNoun = createUpdateFunction(
  properNouns,
  config
)

export const selectProperNouns = createSelectFunction(
  properNouns,
  config
)

export const selectProperNounsByQuery = (
  query: string,
  transaction: DbTransaction
) => {
  return transaction
    .select()
    .from(properNouns)
    .where(
      or(
        sql`to_tsvector('english', ${
          properNouns.name
        }) @@ websearch_to_tsquery('english', ${`${query}:*`})`,
        ilike(properNouns.name, `%${query}%`),
        sql`similarity(${properNouns.entityId}, ${query}) > 0.3`
      )
    )
    .limit(10)
}

const bulkUpsertProperNouns = createBulkUpsertFunction(
  properNouns,
  config
)

export const bulkUpsertProperNounsByEntityId = (
  data: ProperNoun.Insert[],
  transaction: DbTransaction
) => {
  return bulkUpsertProperNouns(
    data,
    [properNouns.entityId, properNouns.entityType],
    transaction
  )
}

export const upsertProperNounByEntityId = (
  data: ProperNoun.Insert,
  transaction: DbTransaction
) => {
  return bulkUpsertProperNounsByEntityId([data], transaction)
}
