import { NextRequest, NextResponse } from 'next/server'
import { requestMagicLinkSchema } from '@/apiSchemas'
import { requestMagicLink } from '@/flowgladHostedBillingApi'

export const POST = async (request: NextRequest) => {
  const body = await request.json()
  const parseResult = requestMagicLinkSchema.safeParse(body)

  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parseResult.error },
      { status: 400 }
    )
  }
  const response = await requestMagicLink(parseResult.data)
  return NextResponse.json(response)
}
