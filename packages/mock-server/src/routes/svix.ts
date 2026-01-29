import {
  generateId,
  generateSvixEndpointId,
  generateSvixMessageId,
  generateSvixWebhookSecret,
} from '../utils/ids'

interface SvixAppResponse {
  id: string
  name: string
  uid: string
  createdAt: string
}

interface SvixEndpointResponse {
  id: string
  url: string
  uid: string
  createdAt: string
}

interface SvixEndpointSecretResponse {
  key: string
}

interface SvixMessageResponse {
  id: string
  eventType: string
  payload: Record<string, unknown>
  timestamp: string
}

/**
 * Helper to create a JSON Response
 */
function jsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

/**
 * Helper to parse JSON body from request
 */
async function parseJsonBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T
  } catch {
    return null
  }
}

/**
 * POST /api/v1/app
 * Create a new application
 */
export async function handleCreateApp(
  req: Request
): Promise<Response> {
  const body = await parseJsonBody<{ name?: string; uid?: string }>(
    req
  )

  const response: SvixAppResponse = {
    id: `app_mock_${generateId()}`,
    name: body?.name ?? 'Mock Application',
    uid: body?.uid ?? generateId(),
    createdAt: new Date().toISOString(),
  }

  return jsonResponse(response, 201)
}

/**
 * GET /api/v1/app/:appId
 * Get an application by ID
 */
export function handleGetApp(appId: string): Response {
  const response: SvixAppResponse = {
    id: appId.startsWith('app_') ? appId : `app_mock_${generateId()}`,
    name: 'Mock Application',
    uid: generateId(),
    createdAt: new Date().toISOString(),
  }

  return jsonResponse(response)
}

/**
 * POST /api/v1/app/:appId/endpoint
 * Create a new endpoint for an application
 */
export async function handleCreateEndpoint(
  req: Request,
  _appId: string
): Promise<Response> {
  const body = await parseJsonBody<{ url?: string; uid?: string }>(
    req
  )

  const response: SvixEndpointResponse = {
    id: generateSvixEndpointId(),
    url: body?.url ?? 'https://mock-endpoint.com/webhook',
    uid: body?.uid ?? generateId(),
    createdAt: new Date().toISOString(),
  }

  return jsonResponse(response, 201)
}

/**
 * PATCH /api/v1/app/:appId/endpoint/:endpointId
 * Update an existing endpoint
 */
export async function handleUpdateEndpoint(
  req: Request,
  _appId: string,
  endpointId: string
): Promise<Response> {
  const body = await parseJsonBody<{ url?: string; uid?: string }>(
    req
  )

  const response: SvixEndpointResponse = {
    id: endpointId.startsWith('ep_')
      ? endpointId
      : generateSvixEndpointId(),
    url: body?.url ?? 'https://mock-endpoint.com/webhook',
    uid: body?.uid ?? generateId(),
    createdAt: new Date().toISOString(),
  }

  return jsonResponse(response)
}

/**
 * GET /api/v1/app/:appId/endpoint/:endpointId/secret
 * Get the signing secret for an endpoint
 */
export function handleGetEndpointSecret(
  _appId: string,
  _endpointId: string
): Response {
  const response: SvixEndpointSecretResponse = {
    key: generateSvixWebhookSecret(),
  }

  return jsonResponse(response)
}

/**
 * POST /api/v1/app/:appId/msg
 * Send a message (webhook event) to an application
 */
export async function handleSendMessage(
  req: Request,
  _appId: string
): Promise<Response> {
  const body = await parseJsonBody<{
    eventType?: string
    payload?: Record<string, unknown>
  }>(req)

  const response: SvixMessageResponse = {
    id: generateSvixMessageId(),
    eventType: body?.eventType ?? 'mock.event',
    payload: body?.payload ?? {},
    timestamp: new Date().toISOString(),
  }

  return jsonResponse(response, 202)
}

/**
 * Route handler for Svix mock server
 * Matches paths against Svix API patterns and dispatches to appropriate handlers
 */
export function handleSvixRoute(
  req: Request,
  pathname: string
): Response | Promise<Response> | null {
  const method = req.method

  // POST /api/v1/app - Create application
  if (method === 'POST' && pathname === '/api/v1/app') {
    return handleCreateApp(req)
  }

  // GET /api/v1/app/:appId - Get application
  const getAppMatch = pathname.match(/^\/api\/v1\/app\/([^/]+)\/?$/)
  if (method === 'GET' && getAppMatch) {
    return handleGetApp(getAppMatch[1])
  }

  // POST /api/v1/app/:appId/endpoint - Create endpoint
  const createEndpointMatch = pathname.match(
    /^\/api\/v1\/app\/([^/]+)\/endpoint\/?$/
  )
  if (method === 'POST' && createEndpointMatch) {
    return handleCreateEndpoint(req, createEndpointMatch[1])
  }

  // PATCH /api/v1/app/:appId/endpoint/:endpointId - Update endpoint
  const updateEndpointMatch = pathname.match(
    /^\/api\/v1\/app\/([^/]+)\/endpoint\/([^/]+)\/?$/
  )
  if (method === 'PATCH' && updateEndpointMatch) {
    return handleUpdateEndpoint(
      req,
      updateEndpointMatch[1],
      updateEndpointMatch[2]
    )
  }

  // GET /api/v1/app/:appId/endpoint/:endpointId/secret - Get endpoint secret
  const getSecretMatch = pathname.match(
    /^\/api\/v1\/app\/([^/]+)\/endpoint\/([^/]+)\/secret\/?$/
  )
  if (method === 'GET' && getSecretMatch) {
    return handleGetEndpointSecret(
      getSecretMatch[1],
      getSecretMatch[2]
    )
  }

  // POST /api/v1/app/:appId/msg - Send message
  const sendMessageMatch = pathname.match(
    /^\/api\/v1\/app\/([^/]+)\/msg\/?$/
  )
  if (method === 'POST' && sendMessageMatch) {
    return handleSendMessage(req, sendMessageMatch[1])
  }

  // No matching route
  return null
}
