import { pricesClientSelectSchema } from '@/db/schema/prices'
import { NextResponse } from 'next/server'
import SuperJSON from 'superjson'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  return NextResponse.json({
    message: 'pong',
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
  })
}
