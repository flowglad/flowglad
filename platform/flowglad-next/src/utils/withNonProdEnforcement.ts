import { type NextRequest, NextResponse } from 'next/server'

export const withNonProdRouteEnforcement = (
  handler: (request: NextRequest) => Promise<Response>
) => {
  return async (request: NextRequest) => {
    if (process.env.VERCEL_ENV === 'production') {
      return NextResponse.json(
        { error: 'Not allowed' },
        { status: 401 }
      )
    }
    return handler(request)
  }
}
