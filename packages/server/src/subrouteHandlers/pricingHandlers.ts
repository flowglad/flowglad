import { type FlowgladActionKey, HTTPMethod } from '@flowglad/shared'
import type { FlowgladServerAdmin } from '../FlowgladServerAdmin'
import type { InferRouteHandlerParams } from './types'

/**
 * Response type for the getDefaultPricingModel handler.
 */
export interface GetDefaultPricingModelResponse {
  data: object
  status: number
  error?: { message: string }
}

/**
 * Handler for fetching the default pricing model.
 * This is a public route that does not require authentication.
 *
 * @param params - The request parameters containing method and data
 * @param admin - The FlowgladServerAdmin instance
 * @returns The default pricing model or an error response
 */
export const getDefaultPricingModel = async (
  params: InferRouteHandlerParams<FlowgladActionKey.GetDefaultPricingModel>,
  admin: FlowgladServerAdmin
): Promise<GetDefaultPricingModelResponse> => {
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
      data: response,
      status: 200,
    }
  } catch (error) {
    if (error instanceof Error) {
      return {
        data: {},
        status: 500,
        error: {
          message: error.message,
        },
      }
    }
    return {
      data: {},
      status: 500,
      error: {
        message: 'Failed to fetch default pricing model',
      },
    }
  }
}
