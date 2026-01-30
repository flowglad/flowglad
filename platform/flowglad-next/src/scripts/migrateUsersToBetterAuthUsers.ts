/* 
run the following in the terminal
NODE_ENV=production bunx tsx src/scripts/migrateUsersToBetterAuthUsers.ts
*/

import { user as betterAuthUsers } from '@db-core/schema/betterAuthSchema'
import { users } from '@db-core/schema/users'
import { eq, isNull } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { auth } from '@/utils/auth'
import runScript from './scriptRunner'

async function example(db: PostgresJsDatabase) {
  // eslint-disable-next-line no-console
  await db.transaction(async (transaction) => {
    const nonMigratedUsers = await transaction
      .select()
      .from(users)
      .where(isNull(users.betterAuthId))
    const ctx = await auth.$context
    for (const user of nonMigratedUsers) {
      const existingUser = await transaction
        .select()
        .from(betterAuthUsers)
        .where(eq(betterAuthUsers.email, user.email!))
        .limit(1)
        .then((res) => res[0])
      if (existingUser) {
        await transaction
          .update(users)
          .set({
            betterAuthId: existingUser.id,
          })
          .where(eq(users.id, user.id))
      } else {
        const createResult = await ctx.adapter.create<{
          id: string
        }>({
          model: 'user',
          data: {
            id: user.id,
            name: user.name! ?? '',
            email: user.email!,
            role: 'user',
            emailVerified: false,
          },
        })
        await transaction
          .update(users)
          .set({
            betterAuthId: createResult.id,
          })
          .where(eq(users.id, user.id))
      }
    }
  })
}

runScript(example)
