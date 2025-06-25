import { echoTest } from './tools/echoTest'
import { McpServer, toolWrap } from './toolWrap'

const tools = [echoTest]
export const toolSet = (server: McpServer) =>
  tools.map((tool) => toolWrap(tool, server))

export const toolCapabilities: Record<
  string,
  { description: string }
> = tools.reduce(
  (acc, tool) => {
    acc[tool.name] = {
      description: tool.description,
    }
    return acc
  },
  {} as Record<string, { description: string }>
)
