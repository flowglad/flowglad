import { createMcpHandler } from '@vercel/mcp-adapter'
import { toolCapabilities, toolSet } from '@/mcp/toolSet'
import { NextRequest } from 'next/server'

const handler = (req: NextRequest) => {
  const authenticatedMCP = createMcpHandler(
    (server) =>
      toolSet(
        server,
        req.headers.get('Authorization')!.split(' ')[1]
      ),
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
  return authenticatedMCP(req)
}

export { handler as GET, handler as POST, handler as DELETE }
