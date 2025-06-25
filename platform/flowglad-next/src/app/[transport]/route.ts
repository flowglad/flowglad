import { createMcpHandler } from '@vercel/mcp-adapter'
import { toolCapabilities, toolSet } from '@/mcp/toolSet'

const handler = createMcpHandler(
  async (server) => {
    toolSet(server)
  },
  {
    capabilities: {
      tools: toolCapabilities,
    },
  },
  {
    basePath: '',
    verboseLogs: true,
    maxDuration: 60,
  }
)

export { handler as GET, handler as POST, handler as DELETE }
