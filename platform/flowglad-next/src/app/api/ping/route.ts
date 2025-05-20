import { core } from '@/utils/core'
import { NextResponse } from 'next/server'
import { seedDatabase } from '@/../seedDatabase'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  await seedDatabase()
  return NextResponse.json({
    message: 'pong',
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    isTest: core.IS_TEST,
  })
}
