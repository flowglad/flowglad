import db from '@/db/client'
import { core } from '@/utils/core'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  return NextResponse.json({
    message: 'pong',
    currentUser: await db.execute(sql`SELECT current_user;`),
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    isTest: core.IS_TEST,
  })
}
