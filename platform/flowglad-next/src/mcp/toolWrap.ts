import { z } from 'zod'
import { createMcpHandler } from 'mcp-handler'

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
  callbackConstructor: (apikey: string) => (args: {
    [K in keyof T]: z.infer<T[K]>
  }) => Promise<ToolResponse>
}

export type ToolConstructor<T extends z.ZodRawShape> = ServerTool<T>

export function toolWrap<T extends z.ZodRawShape>(
  tool: ToolConstructor<T>,
  server: McpServer,
  apiKey: string
): ServerTool<T> {
  const { name, description, schema, callbackConstructor } = tool

  // mcp-handler expects a Zod object schema
  // Wrap the raw shape with z.object() to create proper JSON Schema with type: "object"
  const zodSchema = z.object(schema)

  server.tool(
    name,
    description,
    zodSchema, // Pass as z.object() so it generates proper JSON Schema
    async (args: any, extra?: { authInfo?: { token?: string } }) => {
      // Extract API key from authInfo if available, otherwise use the passed apiKey
      const key = extra?.authInfo?.token || apiKey
      return await callbackConstructor(key)(args)
    }
  )

  return tool
}
