import { flowgladServer } from '@/flowglad'
import { getUserBillingPortalApiKey, stackServerApp } from '@/stack'
import { NextRequest, NextResponse } from 'next/server'
import { createAppRouterRouteHandler } from '@flowglad/nextjs/server'

const handler = async (
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ organizationId: string; path: string[] }> }
) => {
  const { organizationId, path } = await params
  const user = await stackServerApp(organizationId).getUser()
  if (!user) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    )
  }
  const billingPortalApiKey = await getUserBillingPortalApiKey({
    organizationId,
    user,
  })
  if (!billingPortalApiKey) {
    return NextResponse.json(
      { error: 'Billing portal API key not found' },
      { status: 404 }
    )
  }
  const fgServer = flowgladServer({
    organizationId,
    billingPortalApiKey,
  })
  const innermostHandler = createAppRouterRouteHandler(fgServer)
  return innermostHandler(request, {
    params: Promise.resolve({ path }),
  })
}

export { handler as GET, handler as POST }
