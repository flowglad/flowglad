import { getStripeOAuthUrl } from '@/utils/stripe'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export const GET = async () => {
  return NextResponse.json({
    message: 'pong',
    oauthUrl: getStripeOAuthUrl(),
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
  })
}
