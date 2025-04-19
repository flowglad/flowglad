import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createDeleteFunction,
} from '@/db/tableUtils'
import {
  Link,
  links,
  linksInsertSchema,
  linksSelectSchema,
  linksUpdateSchema,
} from '@/db/schema/links'
import { DbTransaction } from '@/db/types'

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
