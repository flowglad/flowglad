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
  }).signInWithMagicLink(code)
  if (result) {
    console.log(
      '====magic link validate result',
      result,
      '===code',
      code
    )
  }
  redirect(`/p/${organizationId}/${externalId}/manage`)
}
