/* 
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/migrateUsersToBetterAuthUsers.ts
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { eq, isNull } from 'drizzle-orm'
import { users } from '@/db/schema/users'
import { user as betterAuthUsers } from '@/db/schema/betterAuthSchema'
import { auth } from '@/utils/auth'

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
