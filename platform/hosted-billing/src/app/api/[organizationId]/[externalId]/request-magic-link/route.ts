import { NextRequest, NextResponse } from 'next/server'
import { requestMagicLinkSchema } from '@/utils/apiSchemas'
import { requestMagicLink } from '@/utils/flowgladHostedBillingApi'
import { logger } from '@/utils/logger'

export const POST = async (request: NextRequest) => {
  logger.info('Received magic link request', {
    organizationId: request.nextUrl.pathname.split('/')[3],
    customerExternalId: request.nextUrl.pathname.split('/')[4],
  })

  const body = await request.json()
  const parseResult = requestMagicLinkSchema.safeParse(body)

  if (!parseResult.success) {
    logger.warn('Invalid request body', {
      error: parseResult.error,
      body,
    })
    return NextResponse.json(
      { error: 'Invalid request body', details: parseResult.error },
      { status: 400 }
    )
  }

  try {
    const response = await requestMagicLink(parseResult.data)
    logger.info('Successfully processed magic link request', {
      organizationId: parseResult.data.organizationId,
      customerExternalId: parseResult.data.customerExternalId,
    })
    return NextResponse.json(response)
  } catch (error) {
    logger.error('Failed to process magic link request', {
      error,
      organizationId: parseResult.data.organizationId,
      customerExternalId: parseResult.data.customerExternalId,
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
