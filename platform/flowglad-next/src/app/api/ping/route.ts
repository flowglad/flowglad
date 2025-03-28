import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  const headersList = await headers()
  const values = headersList.values()

  return NextResponse.json({
    message: 'pong',
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    values,
  })
}
