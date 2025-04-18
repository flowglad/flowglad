import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createUpsertFunction,
  createDeleteFunction,
} from '@/db/tableUtils'
import {
  files,
  filesInsertSchema,
  filesSelectSchema,
  filesUpdateSchema,
} from '@/db/schema/files'

const config: ORMMethodCreatorConfig<
  typeof files,
  typeof filesSelectSchema,
  typeof filesInsertSchema,
  typeof filesUpdateSchema
> = {
  selectSchema: filesSelectSchema,
  insertSchema: filesInsertSchema,
  updateSchema: filesUpdateSchema,
  tableName: 'files',
}

export const selectFileById = createSelectById(files, config)

export const insertFile = createInsertFunction(files, config)

export const updateFile = createUpdateFunction(files, config)

export const selectFiles = createSelectFunction(files, config)

export const upsertFileByContentHash = createUpsertFunction(
  files,
  [files.contentHash],
  config
)

export const deleteFile = createDeleteFunction(files)
