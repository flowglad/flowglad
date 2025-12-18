import {
  createRequestHandler,
  type FlowgladServer,
  type RequestHandlerOptions,
} from '@flowglad/server'
import type { HTTPMethod } from '@flowglad/shared'
import { type NextRequest, NextResponse } from 'next/server'

export const createAppRouterRouteHandler = (
  flowgladServer: FlowgladServer,
  options: Omit<RequestHandlerOptions, 'flowgladServer'> = {}
) => {
  const handler = createRequestHandler({ flowgladServer, ...options })

  const routeHandler = async (
    req: NextRequest,
    {
      params,
    }: { params: Promise<{ path: string[] }> | { path: string[] } }
  ): Promise<NextResponse> => {
    // Support both Next 14 and 15
    // in Next.js 14 params is a plain object, in Next.js 15 params is a Promise (breaking change)
    const resolvedParams = 'then' in params ? await params : params
    const { path } = resolvedParams
    const result = await handler({
      path,
      method: req.method as HTTPMethod,
      query:
        req.method === 'GET'
          ? Object.fromEntries(req.nextUrl.searchParams)
          : undefined,
      body:
        req.method !== 'GET'
          ? await req.json().catch(() => ({}))
          : undefined,
    })
    return NextResponse.json(
      {
        error: result.error,
        data: result.data,
      },
      {
        status: result.status,
      }
    )
  }
  return {
    GET: routeHandler,
    POST: routeHandler,
  }
}
