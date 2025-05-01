import { NextRequest } from 'next/server'
import { stackServerApp } from '@/stack'
import { redirect } from 'next/navigation'
import { logger } from '@/utils/logger'
import { portalRoute } from '@/utils/core'

export const GET = async (
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ organizationId: string; externalId: string }>
  }
) => {
  const { organizationId, externalId } = await params
  const code = request.nextUrl.searchParams.get('code')

  logger.info('Starting email verification', {
    organizationId,
    externalId,
  })

  if (!code) {
    logger.warn('Email verification failed - no code provided', {
      organizationId,
      externalId,
    })
    return new Response('No code provided', { status: 400 })
  }

  try {
    await stackServerApp({
      organizationId,
      externalId,
    }).verifyEmail(code)

    logger.info('Email verification successful', {
      organizationId,
      externalId,
    })
  } catch (error) {
    console.log('====email verify error', error)
    logger.error('Email verification failed', {
      organizationId,
      externalId,
      error,
    })
    throw error
  }
  redirect(
    portalRoute({
      organizationId,
      customerExternalId: externalId,
      page: 'manage',
    })
  )
}
