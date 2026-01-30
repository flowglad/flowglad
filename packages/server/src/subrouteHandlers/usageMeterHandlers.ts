import {
  type FlowgladActionKey,
  getUsageMeterBalancesSchema,
  HTTPMethod,
} from '@flowglad/shared'
import type { FlowgladServer } from '../FlowgladServer'
import { parseErrorStringToErrorObject } from '../serverUtils'
import type {
  SubRouteHandler,
  SubRouteHandlerResultData,
} from './types'

/**
 * Handler for fetching usage meter balances for the authenticated customer.
 * Returns usage meter balances for current subscriptions, optionally filtered by subscriptionId.
 * Delegates to FlowgladServer.getUsageMeterBalances which calls the platform endpoint.
 */
export const getUsageMeterBalances: SubRouteHandler<
  FlowgladActionKey.GetUsageMeterBalances
> = async (params, flowgladServer: FlowgladServer) => {
  let error:
    | { code: string; json: Record<string, unknown> }
    | undefined
  let status: number
  let data: SubRouteHandlerResultData<FlowgladActionKey.GetUsageMeterBalances> =
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
    const parsedParams = getUsageMeterBalancesSchema.parse(
      params.data
    )

    // Delegate to FlowgladServer method
    const result =
      await flowgladServer.getUsageMeterBalances(parsedParams)
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
