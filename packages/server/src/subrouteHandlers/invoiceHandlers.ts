import {
  type FlowgladActionKey,
  getInvoicesSchema,
  HTTPMethod,
} from '@flowglad/shared'
import type { FlowgladServer } from '../FlowgladServer'
import { parseErrorStringToErrorObject } from '../serverUtils'
import type {
  SubRouteHandler,
  SubRouteHandlerResultData,
} from './types'

/**
 * Handler for fetching invoices for the authenticated customer.
 * Returns invoices with optional pagination support.
 * Delegates to FlowgladServer.getInvoices which extracts data from getBilling().
 */
export const getInvoices: SubRouteHandler<
  FlowgladActionKey.GetInvoices
> = async (params, flowgladServer: FlowgladServer) => {
  let error:
    | { code: string; json: Record<string, unknown> }
    | undefined
  let status: number
  let data: SubRouteHandlerResultData<FlowgladActionKey.GetInvoices> =
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
    const parsedParams = getInvoicesSchema.parse(params.data)

    // Delegate to FlowgladServer method
    const result = await flowgladServer.getInvoices(parsedParams)
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
