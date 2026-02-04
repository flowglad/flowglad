import {
  type FlowgladActionKey,
  getCustomerDetailsSchema,
  HTTPMethod,
} from '@flowglad/shared'
import type { FlowgladServer } from '../FlowgladServer'
import { parseErrorStringToErrorObject } from '../serverUtils'
import type {
  SubRouteHandler,
  SubRouteHandlerResultData,
} from './types'

/**
 * Handler for fetching customer details for the authenticated customer.
 * Returns customer profile data (id, email, name, externalId, timestamps).
 * Delegates to FlowgladServer.getCustomerDetails which extracts data from getBilling().
 */
export const getCustomerDetails: SubRouteHandler<
  FlowgladActionKey.GetCustomerDetails
> = async (params, flowgladServer: FlowgladServer) => {
  let error:
    | { code: string; json: Record<string, unknown> }
    | undefined
  let status: number
  let data: SubRouteHandlerResultData<FlowgladActionKey.GetCustomerDetails> =
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
    const parsedParams = getCustomerDetailsSchema.parse(params.data)

    // Delegate to FlowgladServer method
    const result = await flowgladServer.getCustomerDetails()
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
