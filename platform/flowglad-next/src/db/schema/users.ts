import * as R from 'ramda'
import { pgTable, text } from 'drizzle-orm/pg-core'
import {
  enhancedCreateInsertSchema,
  constructIndex,
  tableBase,
} from '@/db/tableUtils'
import { createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'

const USERS_TABLE_NAME = 'users'

export const users = pgTable(
  USERS_TABLE_NAME,
  {
    ...R.omit(['livemode'], tableBase('user')),
    id: text('id').primaryKey().unique().notNull(),
    name: text('name'),
    email: text('email'),
  },
  (table) => {
    return [
      constructIndex(USERS_TABLE_NAME, [table.name]),
      constructIndex(USERS_TABLE_NAME, [table.email]),
    ]
  }
).enableRLS()

const insertAndSelectSchema = {
  id: z.string(),
}

export const usersSelectSchema = createSelectSchema(
  users,
  insertAndSelectSchema
)

/**
 * We have to specify the id here because only the Users table has an id column
 * that is part of its insert, as we create the User record based on the id
 * provided by Clerk
 */
export const usersInsertSchema = enhancedCreateInsertSchema(
  users,
  insertAndSelectSchema
).extend({
  id: z.string(),
})

export const usersUpdateSchema = usersInsertSchema.partial().extend({
  id: z.string(),
})

export type UserInsert = z.infer<typeof usersInsertSchema>
export type UserUpdate = z.infer<typeof usersUpdateSchema>
export type UserRecord = z.infer<typeof usersSelectSchema>
