import { NextResponse } from 'next/server'
import { stackServerApp } from '@/stack'
import { users } from '@/db/schema/users'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  await db.transaction(async (tx) => {
    const userRecords = await tx.select().from(users)
    for (const user of userRecords) {
      if (user.stackAuthId) {
        continue
      }
      if (!user.clerkId) {
        await tx
          .update(users)
          .set({ clerkId: user.id })
          .where(eq(users.id, user.id))
      }
      const newStackUser = await stackServerApp.createUser({
        primaryEmail: user.email,
        primaryEmailVerified: true,
        displayName: user.name ?? undefined,
      })
      await tx
        .update(users)
        .set({ stackAuthId: newStackUser.id })
        .where(eq(users.id, user.id))
    }
  })

  return NextResponse.json({
    message: 'pong',
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
  })
}
