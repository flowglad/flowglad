import { core } from '@/utils/core'
import { NextResponse } from 'next/server'
import z from 'zod'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  const parsedDate = z.coerce.date().parse(0)
  return NextResponse.json({
    message: 'pong',
    parsedDate: parsedDate,
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    isTest: core.IS_TEST,
  })
}
