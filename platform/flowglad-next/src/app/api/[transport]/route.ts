import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { verifyApiKey } from '@/utils/unkey'
import {
  createMcpHandler,
  experimental_withMcpAuth,
} from '@vercel/mcp-adapter'
import { z } from 'zod'

const handler = createMcpHandler(
  async (server) => {
    server.tool(
      'echo',
      'description',
      {
        message: z.string(),
      },
      async ({ message }) => ({
        content: [{ type: 'text', text: `Tool echo: ${message}` }],
      })
    )
  },
  {
    capabilities: {
      tools: {
        echo: {
          description: 'Echo a message',
        },
      },
    },
  },
  {
    basePath: '',
    verboseLogs: true,
    maxDuration: 60,
  }
)

const authHandler = experimental_withMcpAuth(
  handler,
  async (request) => {
    const apiKey = request.headers.get('Authorization')?.split(' ')[1]
    if (!apiKey) {
      return undefined
    }
    const { valid, ownerId } = await verifyApiKey(apiKey)
    if (!valid) {
      return undefined
    }
    return {
      token: apiKey,
      clientId: ownerId!,
      scopes: ['*'],
    }
  }
)

export {
  authHandler as GET,
  authHandler as POST,
  authHandler as DELETE,
}
