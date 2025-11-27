import {
  type Link,
  links,
  linksInsertSchema,
  linksSelectSchema,
  linksUpdateSchema,
} from '@/db/schema/links'
import {
  createDeleteFunction,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'

const config: ORMMethodCreatorConfig<
  typeof links,
  typeof linksSelectSchema,
  typeof linksInsertSchema,
  typeof linksUpdateSchema
> = {
  selectSchema: linksSelectSchema,
  insertSchema: linksInsertSchema,
  updateSchema: linksUpdateSchema,
  tableName: 'links',
}

export const selectLinkById = createSelectById(links, config)

export const insertLink = createInsertFunction(links, config)

export const updateLink = createUpdateFunction(links, config)

export const selectLinks = createSelectFunction(links, config)

export const deleteLink = createDeleteFunction(links)

export const insertLinkOrDoNothing = async (
  data: Link.Insert | Link.Record,
  transaction: DbTransaction
) => {
  if ((data as Link.Record).id) {
    return selectLinkById((data as Link.Record).id, transaction)
  }
  return insertLink(data, transaction)
}
