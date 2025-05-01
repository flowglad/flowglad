import { NextRequest } from 'next/server'
import { stackServerApp } from '@/stack'
import { redirect } from 'next/navigation'
import { logger } from '@/utils/logger'

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

  logger.info('Validating magic link', { organizationId, externalId })

  if (!code) {
    logger.warn('No code provided in magic link validation request', {
      organizationId,
      externalId,
    })
    return new Response('No code provided', { status: 400 })
  }

  try {
    const result = await stackServerApp({
      organizationId,
      externalId,
    }).signInWithMagicLink(code)

    logger.info('Magic link validation successful', {
      organizationId,
      externalId,
      result,
    })

    redirect(`/p/${organizationId}/${externalId}/manage`)
  } catch (error) {
    logger.error('Failed to validate magic link', {
      error,
      organizationId,
      externalId,
      code,
    })
    throw error
  }
}
