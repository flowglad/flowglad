import {
  FetchCreateContextFn,
  fetchRequestHandler,
} from '@trpc/server/adapters/fetch'
import { appRouter } from '@/server'
import { createApiContext } from '@/server/trpcContext'
import { NextRequestWithUnkeyContext, withUnkey } from '@unkey/nextjs'
import { ApiEnvironment, FlowgladApiKeyType } from '@/types'
import { NextResponse } from 'next/server'
import { trpcToRest, RouteConfig } from '@/utils/openapi'
import { customersRouteConfigs } from '@/server/routers/customersRouter'
import { productsRouteConfigs } from '@/server/routers/productsRouter'
import { subscriptionsRouteConfigs } from '@/server/routers/subscriptionsRouter'
import { checkoutSessionsRouteConfigs } from '@/server/routers/checkoutSessionsRouter'
import { discountsRouteConfigs } from '@/server/routers/discountsRouter'
import { pricesRouteConfigs } from '@/server/routers/pricesRouter'
import { invoicesRouteConfigs } from '@/server/routers/invoicesRouter'
import { paymentMethodsRouteConfigs } from '@/server/routers/paymentMethodsRouter'
import { usageEventsRouteConfigs } from '@/server/routers/usageEventsRouter'
import { usageMetersRouteConfigs } from '@/server/routers/usageMetersRouter'
import { webhooksRouteConfigs } from '@/server/routers/webhooksRouter'
import { trace, SpanStatusCode, context } from '@opentelemetry/api'
import { logger } from '@/utils/logger'
import {
  catalogsRouteConfigs,
  getDefaultCatalogRouteConfig,
} from '@/server/routers/catalogsRouter'
import {
  paymentsRouteConfigs,
  refundPaymentRouteConfig,
} from '@/server/routers/paymentsRouter'
import core from '@/utils/core'
import { parseUnkeyMeta } from '@/utils/unkey'

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
  ...checkoutSessionsRouteConfigs,
  ...pricesRouteConfigs,
  ...invoicesRouteConfigs,
  ...paymentMethodsRouteConfigs,
  ...paymentsRouteConfigs,
  ...catalogsRouteConfigs,
  ...usageMetersRouteConfigs,
  ...usageEventsRouteConfigs,
  ...webhooksRouteConfigs,
]

const arrayRoutes: Record<string, RouteConfig> = routeConfigs.reduce(
  (acc, route) => {
    return { ...acc, ...route }
  },
  {} as Record<string, RouteConfig>
)

const routes: Record<string, RouteConfig> = {
  ...getDefaultCatalogRouteConfig,
  ...refundPaymentRouteConfig,
  ...customersRouteConfigs,
  ...discountsRouteConfigs,
  ...productsRouteConfigs,
  ...trpcToRest('utils.ping'),
  // note it's important to add the array routes last
  // because the more specific patterns above will match first,
  // so e.g. /catalogs/default will not attempt to match to /catalogs/:id => id="default"
  ...arrayRoutes,
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
            stack: string
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

const innerHandler = async (
  req: NextRequestWithUnkeyContext,
  { params }: { params: Promise<{ path: string[] }> }
) => {
  const tracer = trace.getTracer('rest-api')
  return tracer.startActiveSpan(
    `REST ${req.method}`,
    async (parentSpan) => {
      try {
        if (!req.unkey) {
          parentSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'Unauthorized',
          })
          parentSpan.setAttributes({ 'error.type': 'AUTH_ERROR' })
          return new Response('Unauthorized', { status: 401 })
        }

        const path = (await params).path.join('/')
        parentSpan.setAttributes({
          'http.method': req.method,
          'http.path': path,
        })

        // Create a new context with our parent span
        const ctx = trace.setSpan(context.active(), parentSpan)

        // Find matching route
        const matchingRoute = Object.entries(routes).find(
          ([key, config]) => {
            const [routeMethod, routePath] = key.split(' ')
            return (
              req.method === routeMethod && config.pattern.test(path)
            )
          }
        )
        if (!matchingRoute) {
          // eslint-disable-next-line no-console
          console.log(
            'No matching route found for path ',
            path,
            'among routes ',
            routes
          )
          parentSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'Not Found',
          })
          return new Response('Not Found', { status: 404 })
        }

        const [_, route] = matchingRoute

        // Extract parameters from URL
        const matches = path.match(route.pattern)?.slice(1) || []
        // Get body for POST/PUT requests
        let body = undefined
        if (req.method === 'POST' || req.method === 'PUT') {
          body = await req.json()
        }
        // Map URL parameters and body to tRPC input
        const input = route.mapParams(matches, body)
        // Create modified request with the correct tRPC procedure path
        const newUrl = new URL(req.url)
        newUrl.pathname = `/api/v1/trpc/${route.procedure}`

        let newReq: Request
        // If we have input, add it as a query parameter
        if (input && req.method === 'GET') {
          newUrl.searchParams.set(
            'input',
            JSON.stringify({ json: input })
          )
        } else if (req.method === 'GET') {
          newUrl.searchParams.set(
            'input',
            JSON.stringify({ json: {} })
          )
        }
        /**
         * TRPC expects a POST requests for all mutations.
         * So even if we have a PUT in the OpenAPI spec, we need to convert it to a POST
         * when mapping to TRPC.
         */
        if (
          (input && req.method === 'POST') ||
          req.method === 'PUT'
        ) {
          newReq = new Request(newUrl, {
            headers: req.headers,
            method: 'POST',
            body: JSON.stringify({
              json: input,
            }),
          })
        } else {
          newReq = new Request(newUrl, {
            headers: req.headers,
            method: req.method,
          })
        }
        const unkeyMeta = parseUnkeyMeta(req.unkey?.meta)
        const organizationId =
          unkeyMeta.organizationId || req.unkey?.ownerId!
        // Execute the TRPC handler within our trace context
        const response = await context.with(ctx, () =>
          fetchRequestHandler({
            endpoint: '/api/v1/trpc',
            req: newReq,
            router: appRouter,
            createContext: createApiContext({
              organizationId,
              environment: req.unkey?.environment as ApiEnvironment,
            }) as unknown as FetchCreateContextFn<typeof appRouter>,
          })
        )

        const responseJson: TRPCResponse = await response.json()
        if (!responseJson.result) {
          const errorMessage = parseErrorMessage(
            responseJson.error.json.message
          )
          // Add explicit error logging
          logger.error(`REST API Error: ${req.method} ${path}`, {
            stack: responseJson.error.json.data.stack,
            errorMessage,
            code: responseJson.error.json.data.code,
            input,
            path,
            method: req.method,
            status: 400,
          })

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
      } finally {
        parentSpan.end()
      }
    }
  )
}

const handlerWrapper = core.IS_TEST
  ? innerHandler
  : withUnkey(innerHandler)

const handler = handlerWrapper

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
