import { NextRequest } from 'next/server'
import { stackServerApp } from '@/stack'
import { redirect } from 'next/navigation'

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
  if (!code) {
    return new Response('No code provided', { status: 400 })
  }
  const result = await stackServerApp({
    organizationId,
    externalId,
  }).verifyEmail(code)
  if (result) {
    console.log('====email verify result', result)
  }
  redirect(`/p/${organizationId}/${externalId}/manage`)
}
