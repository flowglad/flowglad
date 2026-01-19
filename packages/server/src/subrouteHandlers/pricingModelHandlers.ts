import type { FlowgladActionKey } from '@flowglad/shared'
import type {
  GetPricingModelResponse,
  HybridSubRouteHandler,
} from './types'

export const getPricingModel: HybridSubRouteHandler<
  typeof FlowgladActionKey.GetPricingModel
> = async (params, context) => {
  const { flowgladServer, flowgladServerAdmin } = context

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHENTICATED PATH
  // If flowgladServer exists, auth succeeded - MUST use customer pricing
  // Any error here is PROPAGATED (500), NOT silently fallen back
  // ═══════════════════════════════════════════════════════════════════════════
  if (flowgladServer) {
    try {
      const { pricingModel } = await flowgladServer.getPricingModel()
      const response: GetPricingModelResponse = {
        pricingModel,
        source: 'customer',
      }
      return {
        data: { ...response },
        status: 200,
      }
    } catch (error) {
      // ⚠️ ERROR: Auth succeeded but pricing fetch failed
      // ⚠️ DO NOT fall back to default - propagate the error
      console.error(
        '[GetPricingModel] Customer pricing fetch failed after successful auth:',
        error
      )
      return {
        data: {},
        status: 500,
        error: {
          code: 'PRICING_MODEL_FETCH_FAILED',
          json: {
            message: 'Failed to retrieve customer pricing model',
            details:
              error instanceof Error ? error.message : undefined,
          },
        },
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UNAUTHENTICATED PATH
  // flowgladServer is null, meaning auth was not established
  // This is the ONLY case where we fall back to default pricing
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const result = await flowgladServerAdmin.getDefaultPricingModel()
    // Normalize response shape - handle both { pricingModel } wrapper and direct return
    const pricingModel =
      result && typeof result === 'object' && 'pricingModel' in result
        ? result.pricingModel
        : result
    const response: GetPricingModelResponse = {
      pricingModel,
      source: 'default',
    }
    return {
      data: { ...response },
      status: 200,
    }
  } catch (error) {
    // ERROR: Default pricing fetch failed - no fallback available
    console.error(
      '[GetPricingModel] Default pricing fetch failed:',
      error
    )
    return {
      data: {},
      status: 500,
      error: {
        code: 'DEFAULT_PRICING_MODEL_FETCH_FAILED',
        json: {
          message: 'Failed to retrieve default pricing model',
          details: error instanceof Error ? error.message : undefined,
        },
      },
    }
  }
}
