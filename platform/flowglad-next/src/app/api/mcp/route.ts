import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { toolSet } from '@/mcp/toolSet'
import core from '@/utils/core'

// Create MCP handler with tools
const handler = createMcpHandler(
  (server) => {
    // Register all tools - mcp-handler will auto-discover them
    toolSet(server, '')
  },
  {},
  {
    basePath: '/api',
    verboseLogs: true,
    maxDuration: 60,
  }
)

const verifyToken = async (
  req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> => {
  // Extract token from Authorization header if not provided
  if (!bearerToken) {
    const authHeader = req.headers.get('Authorization')

    if (!authHeader) {
      console.warn('[MCP] No Authorization header provided')
      return undefined
    }

    // Use regex to extract Bearer token (same as commit 53518871cb743070a23cb89ffb7e326075282811)
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    if (!match) {
      console.warn('[MCP] Invalid Authorization header format')
      return undefined
    }

    bearerToken = match[1]
  }

  // Use environment variable for bearer token
  const expectedToken = process.env.MCP_BEARER_TOKEN
  if (!expectedToken) {
    console.warn('[MCP] MCP_BEARER_TOKEN not set in environment')
    return undefined
  }

  const isValid = bearerToken === expectedToken

  if (!isValid) {
    console.warn('[MCP] Invalid token provided')
    return undefined
  }

  // Return AuthInfo on successful verification
  return {
    token: bearerToken,
    clientId: 'authenticated-user',
    scopes: ['*'],
  }
}

// Helper to create a simplified verifyToken that uses already-verified authInfo
// This avoids double verification since we already verified in POST handler
const createVerifiedTokenHandler = (authInfo: AuthInfo) => {
  return async (
    req: Request,
    bearerToken?: string
  ): Promise<AuthInfo> => authInfo
}

/**
 * MCP Server Route at /api/mcp
 *
 * Authentication: Set MCP_BEARER_TOKEN in .env.local
 * The bearer token from the Authorization header must match MCP_BEARER_TOKEN.
 *
 * Example .env.local:
 *   MCP_BEARER_TOKEN=your-secret-bearer-token-here
 */
export async function POST(req: Request) {
  try {
    // Log incoming headers for debugging
    const authHeader = req.headers.get('Authorization')
    if (core.IS_PROD) {
      throw Error('Unauthorized: MCP not enabled')
    }
    // Verify authentication first - if undefined, return error immediately and stop
    const authInfo = await verifyToken(req)
    if (!authInfo) {
      // Determine the specific error message
      let errorMessage =
        'Unauthorized: Invalid or missing authentication token'
      if (!authHeader) {
        errorMessage = 'Unauthorized: Missing Authorization header'
      } else if (!authHeader.match(/^Bearer\s+(.+)$/i)) {
        errorMessage =
          'Unauthorized: Invalid Authorization header format'
      } else if (!process.env.MCP_BEARER_TOKEN) {
        errorMessage = 'Unauthorized: MCP_BEARER_TOKEN not configured'
      }

      // Return error response and stop execution - don't call handler
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: errorMessage,
          },
          id: null,
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Create authHandler with pre-verified authInfo (avoids double verification)
    const verifiedTokenHandler = createVerifiedTokenHandler(authInfo)
    const authHandler = withMcpAuth(handler, verifiedTokenHandler, {
      required: false, // Tools will still receive authInfo when calling tools
    })

    // Ensure Accept header is set (required by mcp-handler)
    const acceptHeader = req.headers.get('Accept')
    if (!acceptHeader || !acceptHeader.includes('application/json')) {
      // Clone request with Accept header
      const headers = new Headers(req.headers)
      headers.set('Accept', 'application/json, text/event-stream')

      const body = req.body ? await req.text() : null
      const modifiedReq = new Request(req.url, {
        method: req.method,
        headers,
        body,
      })
      return await authHandler(modifiedReq)
    }

    return await authHandler(req)
  } catch (error) {
    console.error('[MCP] Error:', error)

    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data:
            error instanceof Error ? error.message : String(error),
        },
        id: null,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

// Handle GET requests - return a simple JSON response indicating the endpoint is available
export async function GET(req: Request) {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      result: {
        service: 'mcp-server',
        version: '1.0.0',
        status: 'available',
      },
      id: null,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  )
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, Accept',
    },
  })
}
