import { z } from 'zod'
import { createMcpHandler } from '@vercel/mcp-adapter'

export type McpHandler = typeof createMcpHandler

type InitializeMcpServer = Parameters<McpHandler>[0]

export type McpServer = Parameters<InitializeMcpServer>[0]
export type ToolRegistrar = McpServer['tool']
export type ToolCallback = Parameters<ToolRegistrar>[4]
export type ToolResponse = ReturnType<ToolCallback>

export interface ServerTool<T extends z.ZodRawShape> {
  name: string
  description: string
  schema: T
  callbackConstructor: (
    apikey: string
  ) => (
    args: { [K in keyof T]: z.infer<T[K]> }
  ) => Promise<ToolResponse>
}

export type ToolConstructor<T extends z.ZodRawShape> = ServerTool<T>

export function toolWrap<T extends z.ZodRawShape>(
  tool: ToolConstructor<T>,
  server: McpServer,
  apiKey: string
): ServerTool<T> {
  const { name, description, schema, callbackConstructor } = tool
  server.tool(name, description, schema, async (args) => {
    // @ts-expect-error - zod types are not compatible with the mcp types
    return await callbackConstructor(apiKey)(args)
  })

  return tool
}
