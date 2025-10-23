import { xmcpHandler } from '@xmcp/adapter'

/**
 * Verify the Bearer token from the Authorization header
 */
function verifyBearerToken(req: Request): boolean {
  const authHeader = req.headers.get('Authorization')

  if (!authHeader) {
    console.warn('No Authorization header provided')
    return false
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    console.warn('Invalid Authorization header format')
    return false
  }

  const token = match[1]

  // TODO: Replace with actual API key verification
  // Example:
  // import { verifyApiKey } from '@/utils/unkey'
  // const { result } = await verifyApiKey(token)
  // const isValid = result?.valid ?? false

  // For now, hardcoded for testing
  const isValid = token === process.env.MCP_BEARER_TOKEN

  if (!isValid) {
    console.warn('Invalid token provided')
  }

  return isValid
}

/**
 * Authenticated MCP handler with API key verification
 */
export async function mcpHandler(req: Request) {
  // Verify authentication
  if (!verifyBearerToken(req)) {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message:
            'Unauthorized: Invalid or missing authentication token',
        },
        id: null,
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  }

  // Call the actual MCP handler
  return xmcpHandler(req)
}
