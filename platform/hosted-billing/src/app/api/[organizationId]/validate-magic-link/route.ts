import { NextRequest } from 'next/server'
import { stackServerApp } from '@/stack'
import { redirect } from 'next/navigation'

export const GET = async (
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ organizationId: string }>
  }
) => {
  const { organizationId } = await params
  const code = request.nextUrl.searchParams.get('code')
  if (!code) {
    return new Response('No code provided', { status: 400 })
  }
  await stackServerApp(organizationId).signInWithMagicLink(code)
  redirect(`/${organizationId}/manage`)
}
