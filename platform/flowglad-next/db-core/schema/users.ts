import { pgTable, text } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import * as R from 'ramda'
import { z } from 'zod'
import {
  constructIndex,
  ommittedColumnsForInsertSchema,
  type SelectConditions,
  tableBase,
} from '../tableUtils'

const USERS_TABLE_NAME = 'users'

export const users = pgTable(
  USERS_TABLE_NAME,
  {
    ...R.omit(['livemode'], tableBase('user')),
    id: text('id').primaryKey().unique().notNull(),
    name: text('name'),
    email: text('email').notNull(),
    clerkId: text('clerk_id').unique(),
    betterAuthId: text('better_auth_id').unique(),
    stackAuthId: text('stack_auth_id').unique(),
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
export const usersInsertSchema = createInsertSchema(users)
  .omit(ommittedColumnsForInsertSchema)
  .extend(insertAndSelectSchema)
  .extend({
    id: z.string(),
  })

export const usersUpdateSchema = usersInsertSchema.partial().extend({
  id: z.string(),
})

export namespace User {
  export type Insert = z.infer<typeof usersInsertSchema>
  export type Update = z.infer<typeof usersUpdateSchema>
  export type Record = z.infer<typeof usersSelectSchema>
  export type Where = SelectConditions<typeof users>
}
