import type { Flowglad as FlowgladNode } from '@flowglad/node'
import { HTTPMethod } from '@flowglad/shared'
import type { FlowgladServerAdmin } from '../FlowgladServerAdmin'

type PricingModelRetrieveDefaultResponse =
  FlowgladNode.PricingModels.PricingModelRetrieveDefaultResponse

export interface PublicRouteHandlerParams {
  method: HTTPMethod
  data: unknown
}

export interface PublicRouteHandlerResult {
  data: PricingModelRetrieveDefaultResponse | Record<string, never>
  status: number
  error?: {
    message: string
  }
}

/**
 * Handler for fetching the default pricing model.
 * This is a public route that doesn't require authentication.
 *
 * @param params - The request parameters containing method and data
 * @param admin - The FlowgladServerAdmin instance
 * @returns The pricing model response or error
 */
export const getDefaultPricingModel = async (
  params: PublicRouteHandlerParams,
  admin: FlowgladServerAdmin
): Promise<PublicRouteHandlerResult> => {
  if (params.method !== HTTPMethod.GET) {
    return {
      data: {},
      status: 405,
      error: {
        message: 'Method not allowed',
      },
    }
  }

  try {
    const pricingModel = await admin.getDefaultPricingModel()
    return {
      data: pricingModel,
      status: 200,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to fetch default pricing model'
    return {
      data: {},
      status: 500,
      error: {
        message: errorMessage,
      },
    }
  }
}
