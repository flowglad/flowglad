import {
  FetchCreateContextFn,
  fetchRequestHandler,
} from '@trpc/server/adapters/fetch'
import { appRouter } from '@/server'
import { createApiContext } from '@/server/trpcContext'
import { NextRequestWithUnkeyContext, withUnkey } from '@unkey/nextjs'
import { ApiEnvironment } from '@/types'
import { NextResponse } from 'next/server'
import { trpcToRest, RouteConfig } from './trpcToRest'
import { customerProfilesRouteConfigs } from '@/server/routers/customerProfilesRouter'
import { productsRouteConfigs } from '@/server/routers/productsRouter'
import { subscriptionsRouteConfigs } from '@/server/routers/subscriptionsRouter'
import { purchaseSessionsRouteConfigs } from '@/server/routers/purchaseSessionsRouter'
import { discountsRouteConfigs } from '@/server/routers/discountsRouter'
import { variantsRouteConfigs } from '@/server/routers/variantsRouter'
import { invoicesRouteConfigs } from '@/server/routers/invoicesRouter'
import { paymentMethodsRouteConfigs } from '@/server/routers/paymentMethodsRouter'
const parseErrorMessage = (rawMessage: string) => {
  let parsedMessage = rawMessage
  try {
    parsedMessage = JSON.parse(rawMessage)
  } catch (error) {
    return rawMessage
  }
  return parsedMessage
}

const routeConfigs = [
  ...subscriptionsRouteConfigs,
  ...purchaseSessionsRouteConfigs,
  ...variantsRouteConfigs,
  ...invoicesRouteConfigs,
  ...paymentMethodsRouteConfigs,
]

const arrayRoutes: Record<string, RouteConfig> = routeConfigs.reduce(
  (acc, route) => {
    return { ...acc, ...route }
  },
  {} as Record<string, RouteConfig>
)

const routes: Record<string, RouteConfig> = {
  ...arrayRoutes,
  ...customerProfilesRouteConfigs,
  ...productsRouteConfigs,
  ...discountsRouteConfigs,
  ...trpcToRest('utils.ping'),
} as const

type TRPCResponse =
  | {
      error: {
        json: {
          message: string
          code: number
          data: {
            code: string
            httpStatus: number
          }
        }
      }
      result: undefined
    }
  | {
      result: {
        data: {
          json: JSON
        }
      }
    }

const handler = withUnkey(
  async (
    req: NextRequestWithUnkeyContext,
    { params }: { params: Promise<{ path: string[] }> }
  ) => {
    if (!req.unkey) {
      return new Response('Unauthorized', { status: 401 })
    }
    if (!req.unkey.valid) {
      return new Response('Unauthorized', { status: 401 })
    }
    const path = (await params).path.join('/')
    const method = req.method
    // Find matching route
    const matchingRoute = Object.entries(routes).find(
      ([key, config]) => {
        const [routeMethod, routePath] = key.split(' ')
        return method === routeMethod && config.pattern.test(path)
      }
    )

    if (!matchingRoute) {
      console.log(
        'No matching route found for path ',
        path,
        'among routes ',
        routes
      )
      return new Response('Not Found', { status: 404 })
    }

    const [_, route] = matchingRoute

    // Extract parameters from URL
    const matches = path.match(route.pattern)?.slice(1) || []
    // Get body for POST/PUT requests
    let body = undefined
    if (method === 'POST' || method === 'PUT') {
      body = await req.json()
    }
    // Map URL parameters and body to tRPC input
    const input = route.mapParams(matches, body)
    // Create modified request with the correct tRPC procedure path
    const newUrl = new URL(req.url)
    newUrl.pathname = `/api/v1/trpc/${route.procedure}`

    let newReq: Request
    // If we have input, add it as a query parameter
    if (input && method === 'GET') {
      newUrl.searchParams.set(
        'input',
        JSON.stringify({ json: input })
      )
    }

    if ((input && method === 'POST') || method === 'PUT') {
      newReq = new Request(newUrl, {
        headers: req.headers,
        method: method,
        body: JSON.stringify({
          json: input,
        }),
      })
    } else {
      newReq = new Request(newUrl, {
        headers: req.headers,
        method: method,
      })
    }

    const response = await fetchRequestHandler({
      endpoint: '/api/v1/trpc',
      req: newReq,
      router: appRouter,
      createContext: createApiContext({
        organizationId: req.unkey.ownerId!,
        environment: req.unkey.environment as ApiEnvironment,
      }) as unknown as FetchCreateContextFn<typeof appRouter>,
    })
    const responseJson: TRPCResponse = await response.json()
    if (!responseJson.result) {
      const errorMessage = parseErrorMessage(
        responseJson.error.json.message
      )
      return NextResponse.json(
        {
          error: errorMessage,
          code: responseJson.error.json.data.code,
        },
        {
          status: 400,
        }
      )
    }
    return NextResponse.json(responseJson.result.data.json)
  }
)

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as DELETE,
}

// Example Usage:
// GET /api/v1/products - lists products
// POST /api/v1/products - creates product
// PUT /api/v1/products/123 - updates product 123
// GET /api/v1/payment-methods - lists payment methods
// GET /api/v1/payment-methods/123 - gets payment method 123
