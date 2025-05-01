import { flowgladServer } from '@/flowglad'
import { getUserBillingPortalApiKey, stackServerApp } from '@/stack'
import { NextRequest, NextResponse } from 'next/server'
import { createAppRouterRouteHandler } from '@flowglad/nextjs/server'
import { logger } from '@/utils/logger'

const handler = async (
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      organizationId: string
      path: string[]
      externalId: string
    }>
  }
) => {
  const { organizationId, path, externalId } = await params
  logger.info('Handling Flowglad request', {
    organizationId,
    externalId,
    path,
  })

  const user = await stackServerApp({
    organizationId,
    externalId,
  }).getUser()
  if (!user) {
    logger.warn('User not found', { organizationId, externalId })
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    )
  }
  logger.debug('User found', {
    organizationId,
    externalId,
    userId: user.id,
  })

  const billingPortalApiKey = await getUserBillingPortalApiKey({
    organizationId,
    user,
  })
  if (!billingPortalApiKey) {
    logger.warn('Billing portal API key not found', {
      organizationId,
      externalId,
      userId: user.id,
    })
    return NextResponse.json(
      { error: 'Billing portal API key not found' },
      { status: 404 }
    )
  }
  logger.debug('Billing portal API key found', {
    organizationId,
    externalId,
    userId: user.id,
  })

  const fgServer = flowgladServer({
    organizationId,
    externalId,
    billingPortalApiKey,
  })
  const innermostHandler = createAppRouterRouteHandler(fgServer)

  try {
    const response = await innermostHandler(request, {
      params: Promise.resolve({ path }),
    })
    logger.info('Flowglad request completed successfully', {
      organizationId,
      externalId,
      path,
    })
    return response
  } catch (error) {
    logger.error('Error handling Flowglad request', {
      organizationId,
      externalId,
      path,
      error,
    })
    throw error
  }
}

export { handler as GET, handler as POST }
