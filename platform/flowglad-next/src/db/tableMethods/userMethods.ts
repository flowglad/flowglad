import {
  users,
  usersInsertSchema,
  usersSelectSchema,
  usersUpdateSchema,
} from '@/db/schema/users'
import {
  createUpsertFunction,
  createSelectById,
  createSelectFunction,
  createInsertFunction,
  ORMMethodCreatorConfig,
  createUpdateFunction,
} from '@/db/tableUtils'

export type UserInsert = typeof users.$inferInsert
export type UserUpdate = Partial<UserInsert>
export type User = typeof users.$inferSelect

const config: ORMMethodCreatorConfig<
  typeof users,
  typeof usersSelectSchema,
  typeof usersInsertSchema,
  typeof usersUpdateSchema
> = {
  insertSchema: usersInsertSchema,
  selectSchema: usersSelectSchema,
  updateSchema: usersUpdateSchema,
  tableName: 'users',
}

export const selectUserById = createSelectById(users, config)

export const upsertUsersByName = createUpsertFunction(
  users,
  users.name,
  config
)

export const upsertUsersByEmail = createUpsertFunction(
  users,
  users.email,
  config
)

export const upsertUserById = createUpsertFunction(
  users,
  users.id,
  config
)

export const selectUsers = createSelectFunction(users, config)

export const insertUser = createInsertFunction(users, config)

export const updateUser = createUpdateFunction(users, config)
