import {
  type FlowgladActionKey,
  getPaymentMethodsSchema,
  HTTPMethod,
} from '@flowglad/shared'
import type { FlowgladServer } from '../FlowgladServer'
import { parseErrorStringToErrorObject } from '../serverUtils'
import type {
  SubRouteHandler,
  SubRouteHandlerResultData,
} from './types'

/**
 * Handler for fetching payment methods for the authenticated customer.
 * Returns payment methods and the billing portal URL.
 * Delegates to FlowgladServer.getPaymentMethods which processes billing data.
 */
export const getPaymentMethods: SubRouteHandler<
  FlowgladActionKey.GetPaymentMethods
> = async (params, flowgladServer: FlowgladServer) => {
  let error:
    | { code: string; json: Record<string, unknown> }
    | undefined
  let status: number
  let data: SubRouteHandlerResultData<FlowgladActionKey.GetPaymentMethods> =
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
    getPaymentMethodsSchema.parse(params.data)

    // Delegate to FlowgladServer method
    const result = await flowgladServer.getPaymentMethods()
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
