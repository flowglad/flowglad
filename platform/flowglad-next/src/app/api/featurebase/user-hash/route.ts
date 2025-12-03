export const runtime = 'nodejs'

import crypto from 'crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/utils/auth'
import { betterAuthUserToApplicationUser } from '@/utils/authHelpers'

export async function GET(_req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const user = await betterAuthUserToApplicationUser(session.user)
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const secret =
      process.env.FEATUREBASE_IDENTITY_VERIFICATION_SECRET
    if (!secret) {
      return NextResponse.json(
        { error: 'Missing FEATUREBASE_IDENTITY_VERIFICATION_SECRET' },
        { status: 500 }
      )
    }

    const userIdentifier = user.id
    const userHash = crypto
      .createHmac('sha256', secret)
      .update(userIdentifier)
      .digest('hex')

    // Optional: no-store to avoid any caching of per-user hashes
    return NextResponse.json(
      {
        userHash,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0, must-revalidate',
        },
      }
    )
  } catch (error) {
    console.error('featurebase user-hash error', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
