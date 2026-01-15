import type { Flowglad as FlowgladNode } from '@flowglad/node'
import { HTTPMethod } from '@flowglad/shared'
import type { FlowgladServerAdmin } from '../FlowgladServerAdmin'

type PricingModel =
  FlowgladNode.Customers.CustomerRetrieveBillingResponse['pricingModel']

export interface PublicRouteHandlerParams {
  method: HTTPMethod
  data: unknown
}

export interface PublicRouteHandlerResult {
  data: PricingModel | Record<string, never>
  status: number
  error?: { message: string }
}

/**
 * Handler for fetching the default pricing model.
 * This is a public route that does not require authentication.
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
    const response = await admin.getDefaultPricingModel()
    return {
      data: response.pricingModel,
      status: 200,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to fetch pricing model'
    return {
      data: {},
      status: 500,
      error: {
        message: errorMessage,
      },
    }
  }
}
