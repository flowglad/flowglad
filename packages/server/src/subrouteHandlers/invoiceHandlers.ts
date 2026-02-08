import {
  type FlowgladActionKey,
  getInvoicesSchema,
  HTTPMethod,
} from '@flowglad/shared'
import type { FlowgladServer } from '../FlowgladServer'
import { mapCaughtErrorToStatusAndPayload } from '../serverUtils'
import type {
  SubRouteHandler,
  SubRouteHandlerResultData,
} from './types'

/**
 * Handler for fetching invoices for the authenticated customer.
 * Returns invoices with optional pagination.
 * Delegates to FlowgladServer.getInvoices which processes billing data.
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
      json: { message: 'Method not allowed' },
    }
    status = 405
    return {
      data,
      status,
      error,
    }
  }

  // Validate input params
  const parsed = getInvoicesSchema.safeParse(params.data)
  if (!parsed.success) {
    return {
      data,
      status: 400,
      error: {
        code: 'Validation error',
        json: {
          message: 'Validation error',
          issues: parsed.error.issues,
        },
      },
    }
  }

  try {
    // Delegate to FlowgladServer method
    const result = await flowgladServer.getInvoices(parsed.data)
    data = result
    status = 200
  } catch (e) {
    const mapped = mapCaughtErrorToStatusAndPayload(e)
    error = mapped.error
    status = mapped.status
  }

  return {
    data,
    status,
    error,
  }
}
