import { z } from 'zod'
import { createMcpHandler } from '@vercel/mcp-adapter'
import { NextRequest } from 'next/server'
import { FlowgladServer } from '@flowglad/server'

export type McpHandler = typeof createMcpHandler

export type InitializeMcpServer = Parameters<McpHandler>[0]

export type McpServer = Parameters<InitializeMcpServer>[0]
export type ToolRegistrar = McpServer['tool']
export type ToolCallback = Parameters<ToolRegistrar>[4]
export type ToolResponse = ReturnType<ToolCallback>

export const toolWithFeatureAccessCheck = <T extends z.ZodRawShape>(
  toolCallback: ToolCallback,
  params: {
    featureSlug: string
    flowgladServer: FlowgladServer
    upgradePriceSlug: string
    successUrl: string
    cancelUrl: string
  }
): ToolCallback => {
  const wrappedCallback = async (
    ...args: Parameters<ToolCallback>
  ): Promise<ToolResponse> => {
    const { featureSlug, flowgladServer, upgradePriceSlug } = params
    const billing = await flowgladServer.getBilling()
    const feature = billing.checkFeatureAccess(featureSlug)
    if (!feature) {
      const price = billing.getPrice(upgradePriceSlug)
      if (!price) {
        return {
          content: [
            {
              type: 'text',
              text: 'Upgrade price not found',
            },
          ],
        }
      }
      const checkoutSession =
        await params.flowgladServer.createCheckoutSession({
          priceId: price.id,
          quantity: 1,
          successUrl: params.successUrl,
          cancelUrl: params.cancelUrl,
        })
      return {
        content: [
          {
            type: 'text',
            text: `Feature access denied. To access this feature, please upgrade at: ${checkoutSession.url}`,
          },
        ],
      }
    }
    return await toolCallback(...args)
  }
  return wrappedCallback
}

export const toolWithUsageBalanceCheck = <T extends z.ZodRawShape>(
  toolCallback: ToolCallback,
  featureSlug: string
): Parameters<ToolRegistrar>[4] => {
  return async (...args: Parameters<ToolCallback>) => {
    return await toolCallback(...args)
  }
}

export const mcpHandlerWithFlowglad = (
  constructor: (
    server: McpServer,
    flowglad: FlowgladServer
  ) => void | Promise<void>,
  flowgladConstructor: (
    request: NextRequest
  ) => Promise<FlowgladServer>
) => {
  const handler = async (request: NextRequest) => {
    const flowglad = await flowgladConstructor(request)
    const mcpHandler = createMcpHandler(async (server) => {
      await constructor(server, flowglad)
      return server
    })
    return await mcpHandler(request)
  }

  return handler
}
