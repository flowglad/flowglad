import { z } from 'zod'
import { createMcpHandler } from '@vercel/mcp-adapter'

type McpHandler = typeof createMcpHandler

type InitializeMcpServer = Parameters<McpHandler>[0]

type McpServer = Parameters<InitializeMcpServer>[0]
type ToolRegistrar = McpServer['tool']
type ToolCallback = Parameters<ToolRegistrar>[4]
type ToolResponse = ReturnType<ToolCallback>

export interface ServerTool<T extends z.ZodRawShape> {
  name: string
  description: string
  schema: T
  callback: (
    args: z.objectOutputType<T, z.ZodTypeAny>
  ) => Promise<ToolResponse>
}

export function toolWrap<T extends z.ZodRawShape>(
  tool: ServerTool<T>,
  server: McpServer
): ServerTool<T> {
  const { name, description, schema, callback } = tool
  /**
   * not clear why, but need to explicitly type the schema as type z.ZodRawShape
   */
  const typedSchema: z.ZodRawShape = schema

  server.tool(name, description, typedSchema, async (args) => {
    // @ts-expect-error - zod types are not compatible with the mcp types
    return await callback(args)
  })

  return tool
}
