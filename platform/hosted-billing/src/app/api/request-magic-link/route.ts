import { NextRequest, NextResponse } from 'next/server'
import {
  requestMagicLinkSchema,
  type RequestMagicLinkBody,
} from '@/apiSchemas'
import axios from 'axios'

export const POST = async (request: NextRequest) => {
  const body = await request.json()
  const parseResult = requestMagicLinkSchema.safeParse(body)

  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parseResult.error },
      { status: 400 }
    )
  }
  const parsedBody: RequestMagicLinkBody = parseResult.data

  // Check if the API key is defined
  const apiKey = process.env.HOSTED_BILLING_LIVEMODE_SECRET_KEY
  if (!apiKey) {
    console.error('THIRD_PARTY_API_KEY is not defined')
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    )
  }

  const response = await axios.post(
    `${process.env.THIRD_PARTY_API_BASE_URL}/api/hosted-billing/request-magic-link`,
    parsedBody,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  )
  if (response.status !== 200) {
    return NextResponse.json(
      { error: 'Failed to send magic link' },
      { status: 500 }
    )
  }
  return NextResponse.json({ success: true })
}
