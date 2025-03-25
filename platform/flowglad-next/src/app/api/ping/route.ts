import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  const too = 200
  console.log('ping???')

  return NextResponse.json({
    message: 'pong',
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
  })
}
