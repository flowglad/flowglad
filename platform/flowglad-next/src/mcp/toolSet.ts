import { echoTest } from './tools/echoTest'
import { McpServer, ToolConstructor, toolWrap } from './toolWrap'
import { setupCatalog } from './tools/setupCatalog'
import { getSetupInstructions } from './tools/getSetupInstructions'

const tools: ToolConstructor<any>[] = [
  echoTest,
  setupCatalog,
  getSetupInstructions,
]

export const toolSet = (server: McpServer, apiKey: string) =>
  tools.map((tool) => toolWrap(tool, server, apiKey))

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
