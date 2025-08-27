import { echoTest } from './tools/echoTest'
import { McpServer, ToolConstructor, toolWrap } from './toolWrap'
import { setupPricingModel } from './tools/setupPricingModel'
import { getSetupInstructions } from './tools/getSetupInstructions'
import { getDefaultPricingModel } from './tools/getDefaultPricingModel'

const tools: ToolConstructor<any>[] = [
  echoTest,
  setupPricingModel,
  getSetupInstructions,
  getDefaultPricingModel,
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
