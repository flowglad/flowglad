import { createMcpHandler } from '@vercel/mcp-adapter'
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

export { handler as GET, handler as POST, handler as DELETE }
