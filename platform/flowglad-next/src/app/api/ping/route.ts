import { core } from '@/utils/core'
import { svix } from '@/utils/svix'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  return NextResponse.json({
    message: 'pong',
    someSvix: await svix().application.list(),
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    isTest: core.IS_TEST,
  })
}
