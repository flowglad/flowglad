import {
  type FlowgladActionKey,
  getPurchasesSchema,
  HTTPMethod,
} from '@flowglad/shared'
import type { FlowgladServer } from '../FlowgladServer'
import { parseErrorStringToErrorObject } from '../serverUtils'
import type {
  SubRouteHandler,
  SubRouteHandlerResultData,
} from './types'

/**
 * Handler for fetching purchases for the authenticated customer.
 * Returns purchases with optional pagination.
 * Delegates to FlowgladServer.getPurchases which processes billing data.
 */
export const getPurchases: SubRouteHandler<
  FlowgladActionKey.GetPurchases
> = async (params, flowgladServer: FlowgladServer) => {
  let error:
    | { code: string; json: Record<string, unknown> }
    | undefined
  let status: number
  let data: SubRouteHandlerResultData<FlowgladActionKey.GetPurchases> =
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

  // Validate input params
  const parsed = getPurchasesSchema.safeParse(params.data)
  if (!parsed.success) {
    return {
      data,
      status: 400,
      error: {
        code: 'Validation error',
        json: { issues: parsed.error.issues },
      },
    }
  }

  try {
    // Delegate to FlowgladServer method
    const result = await flowgladServer.getPurchases(parsed.data)
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
