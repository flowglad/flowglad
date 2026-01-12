import type { HTTPMethod } from '@flowglad/shared'
import type { FlowgladServerAdmin } from '../FlowgladServerAdmin'

export interface PricingHandlerParams {
  method: HTTPMethod
  data: unknown
}

export interface PricingHandlerResult {
  data: unknown
  status: number
  error?: {
    message: string
  }
}

/**
 * Handler for retrieving the default pricing model.
 * This is a public route that does not require authentication.
 *
 * @param params - The handler parameters (method and data)
 * @param admin - The FlowgladServerAdmin instance
 * @returns The pricing model data or an error
 */
export const getDefaultPricingModel = async (
  params: PricingHandlerParams,
  admin: FlowgladServerAdmin
): Promise<PricingHandlerResult> => {
  try {
    const result = await admin.getDefaultPricingModel()
    return {
      data: result,
      status: 200,
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to fetch default pricing model'
    return {
      data: {},
      status: 500,
      error: {
        message,
      },
    }
  }
}
