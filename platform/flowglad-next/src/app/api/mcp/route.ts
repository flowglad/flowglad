import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { z } from 'zod/v3'
import {
  getOpenAIClient,
  getTurbopufferClient,
  queryTurbopuffer,
} from '@/utils/turbopuffer'
import { verifyApiKey } from '@/utils/unkey'

// Create MCP handler with tools
const handler = createMcpHandler(
  (server) => {
    // Register MCP tools directly on the server instance
    server.registerTool(
      'echoTest',
      {
        description: 'Echo a test message',
        inputSchema: {
          message: z.string(),
        },
      },
      async ({ message }) => ({
        content: [{ type: 'text', text: `Tool echo: ${message}` }],
      })
    )

    // Query Flowglad documentation using Turbopuffer vector search
    server.registerTool(
      'queryDocs',
      {
        description:
          'Search Flowglad documentation using semantic vector search. Returns relevant documentation sections based on the query.',
        inputSchema: {
          query: z
            .string()
            .min(1)
            .describe(
              'The search query to find relevant documentation'
            ),
        },
      },
      async ({ query }) => {
        try {
          const [tpuf, openai] = await Promise.all([
            getTurbopufferClient(),
            getOpenAIClient(),
          ])

          const results = await queryTurbopuffer(
            query,
            2,
            'flowglad-docs',
            tpuf,
            openai
          )

          if (results.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: `No documentation found for query: "${query}"`,
                },
              ],
            }
          }

          // Dynamically import fetchMarkdownFromDocs to avoid loading fetch/undici at module load time.
          // See docsSearchRouter for explanation.
          const { fetchMarkdownFromDocs } = await import(
            '@/utils/textContent'
          )

          // Fetch full markdown content for each result
          const resultsWithMarkdown = await Promise.all(
            results.map(async (result) => {
              const markdown = await fetchMarkdownFromDocs(
                result.path
              )

              return {
                path: result.path,
                title: result.title,
                description: result.description,
                markdown:
                  markdown || result.text || 'Content not available',
              }
            })
          )

          // Format results nicely with full content
          const formattedResults = resultsWithMarkdown
            .map((result, index) => {
              return `${result.title ? `Title: ${result.title}\n` : ''}${result.description ? `Description: ${result.description}\n` : ''}
${'='.repeat(80)}
${result.markdown}
${'='.repeat(80)}`
            })
            .join('\n\n')

          return {
            content: [
              {
                type: 'text',
                text: `Found ${results.length} result(s) for query: "${query}"\n\n${formattedResults}`,
              },
            ],
          }
        } catch (error) {
          console.error('[MCP] queryDocs error', error)
          return {
            content: [
              {
                type: 'text',
                text: 'Error querying documentation. Please try again later or contact support if the problem persists.',
              },
            ],
          }
        }
      }
    )
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

  // Verify API key using Unkey
  try {
    const { result, error } = await verifyApiKey(bearerToken)

    if (error) {
      console.warn('[MCP] API key verification error:', error)
      return undefined
    }

    if (!result?.valid) {
      console.warn('[MCP] Invalid API key provided')
      return undefined
    }
  } catch (error) {
    console.warn('[MCP] API key verification failed:', error)
    return undefined
  }

  // Return AuthInfo on successful verification
  return {
    token: bearerToken,
    clientId: 'authenticated-user',
    scopes: ['*'],
  }
}

/**
 * MCP Server Route at /api/mcp
 *
 * Authentication: Use API key from /settings > API in the dashboard
 * The API key should be sent in the Authorization header as a Bearer token.
 *
 * Example MCP client configuration:
 *   "Authorization": "Bearer sk_test_..."
 */
// Let withMcpAuth handle authentication using verifyToken
const authHandler = withMcpAuth(handler, verifyToken, {
  required: true, // Auth is required and we verify it via verifyToken
})

export async function POST(req: Request) {
  try {
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
// SECURITY NOTE: This endpoint intentionally allows CORS from any origin because:
// 1. It only returns public, non-sensitive status information (service name, version, availability)
// 2. MCP clients (IDEs, tools) from various origins need to check endpoint availability
// 3. Actual MCP operations require authentication via the POST handler
// If this endpoint ever returns sensitive data, CORS should be restricted.
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
