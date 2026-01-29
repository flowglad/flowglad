import {
  type FlowgladActionKey,
  getFeatureAccessSchema,
  HTTPMethod,
} from '@flowglad/shared'
import type { FlowgladServer } from '../FlowgladServer'
import { parseErrorStringToErrorObject } from '../serverUtils'
import type {
  SubRouteHandler,
  SubRouteHandlerResultData,
} from './types'

/**
 * Handler for fetching feature access items for the authenticated customer.
 * Returns toggle features only, optionally filtered by subscriptionId.
 * Delegates to FlowgladServer.getFeatureAccessItems which calls getBilling.
 */
export const getFeatureAccessItems: SubRouteHandler<
  FlowgladActionKey.GetFeatureAccess
> = async (params, flowgladServer: FlowgladServer) => {
  let error:
    | { code: string; json: Record<string, unknown> }
    | undefined
  let status: number
  let data: SubRouteHandlerResultData<FlowgladActionKey.GetFeatureAccess> =
    {}

  if (params.method !== HTTPMethod.POST) {
    error = {
      code: 'Method not allowed',
      json: {},
    }
    status = 405
    return {
      data,
      status,
      error,
    }
  }

  try {
    // Validate and parse input params
    const parsedParams = getFeatureAccessSchema.parse(
      params.data
    )

    // Delegate to FlowgladServer method
    const result =
      await flowgladServer.getFeatureAccessItems(parsedParams)
    data = result
    status = 200
  } catch (e) {
    if (e instanceof Error) {
      error = parseErrorStringToErrorObject(e.message)
    } else {
      error = {
        code: 'Unknown error',
        json: {},
      }
    }
    status = 500
  }

  return {
    data,
    status,
    error,
  }
}
