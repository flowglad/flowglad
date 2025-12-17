// playground/react-native/app/api/flowglad/[...path]+api.ts
import {
  createRequestHandler,
  FlowgladServer,
} from '@flowglad/server'
import type { HTTPMethod } from '@flowglad/shared'

// Create a flowglad factory (like in generation-based-subscription)
const flowglad = (
  customerExternalId: string,
  email: string,
  name: string
) => {
  return new FlowgladServer({
    baseURL: 'https://app.flowglad.com',
    apiKey: process.env.FLOWGLAD_SECRET_KEY || 'sk_test_...',
    customerExternalId,
    getCustomerDetails: async (externalId) => {
      return {
        email: email,
        name: name,
      }
    },
  })
}

export async function POST(
  request: Request,
  context?: { params?: { path?: string[] } }
) {
  console.log('=== FLOWGLAD API ROUTE HIT ===')
  console.log('URL:', request.url)
  console.log('Method:', request.method)
  console.log('Context:', context)
  console.log('Params:', context?.params)

  try {
    // WORKAROUND 1: Extract path from URL instead of params
    const url = new URL(request.url)
    const pathStr = url.pathname.replace('/api/flowglad/', '')
    const path = pathStr.split('/').filter(Boolean)
    console.log('Extracted path from URL:', path)

    // WORKAROUND 2: Get user from custom headers instead of session
    const userId = request.headers.get('x-user-id')
    const userEmail = request.headers.get('x-user-email')
    const userName = request.headers.get('x-user-name')
    console.log('User from headers:', { userId, userEmail, userName })

    if (!userId) {
      console.log('No user ID in headers, returning 401')
      return Response.json(
        { error: 'Unauthorized - No user in headers' },
        { status: 401 }
      )
    }

    console.log('Creating FlowgladServer for user:', userId)
    const flowgladServer = flowglad(
      userId,
      userEmail || '',
      userName || ''
    )

    console.log('Creating request handler...')
    const handler = createRequestHandler({
      flowgladServer,
      onError: (error) => console.error('Handler error:', error),
    })

    console.log('Calling handler with path:', path)
    const result = await handler({
      path,
      method: request.method as HTTPMethod,
      query:
        request.method === 'GET'
          ? Object.fromEntries(url.searchParams)
          : undefined,
      body:
        request.method !== 'GET'
          ? await request.json().catch(() => ({}))
          : undefined,
    })

    console.log('Result status:', result.status)
    return Response.json(
      {
        error: result.error,
        data: result.data,
      },
      { status: result.status }
    )
  } catch (error) {
    console.error('=== ERROR ===', error)
    return Response.json(
      {
        error: {
          message:
            error instanceof Error ? error.message : String(error),
        },
        data: null,
      },
      { status: 500 }
    )
  }
}

export { POST as GET }
