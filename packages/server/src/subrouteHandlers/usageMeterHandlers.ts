import { type FlowgladActionKey, HTTPMethod } from '@flowglad/shared'
import type { FlowgladServer } from '../FlowgladServer'
import type { SubRouteHandler } from './types'

/**
 * Handler for getting usage meter balances for a customer.
 * Returns usage meter balances for current subscriptions, optionally filtered by subscriptionId.
 * Validates HTTP method and delegates to FlowgladServer.getUsageMeterBalances().
 */
export const getUsageMeterBalances: SubRouteHandler<
  FlowgladActionKey.GetUsageMeterBalances
> = async (params, flowgladServer: FlowgladServer) => {
  if (params.method !== HTTPMethod.POST) {
    return {
      data: {},
      status: 405,
      error: {
        code: 'Method not allowed',
        json: {},
      },
    }
  }

  try {
    const result = await flowgladServer.getUsageMeterBalances(
      params.data
    )
    return {
      data: result,
      status: 200,
    }
  } catch (error) {
    return {
      data: {},
      status: 500,
      error: {
        code: 'get_usage_meter_balances_failed',
        json: {
          message: (error as Error).message,
        },
      },
    }
  }
}
