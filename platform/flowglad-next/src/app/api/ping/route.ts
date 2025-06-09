import { core } from '@/utils/core'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  let foo = 1
  const bar: any[] = []
  if (bar) {
    foo = 2
  }
  return NextResponse.json({
    message: 'pong',
    foo,
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    isTest: core.IS_TEST,
  })
}
