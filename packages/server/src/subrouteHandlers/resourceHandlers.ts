import { type FlowgladActionKey, HTTPMethod } from '@flowglad/shared'
import type { FlowgladServer } from '../FlowgladServer'
import type { SubRouteHandler } from './types'

/**
 * Handler for getting all resources with their usage for a customer's subscription.
 * Validates HTTP method and delegates to FlowgladServer.getResourceUsages().
 */
export const getResources: SubRouteHandler<
  FlowgladActionKey.GetResourceUsages
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
    const result = await flowgladServer.getResourceUsages(params.data)
    return {
      data: result,
      status: 200,
    }
  } catch (error) {
    return {
      data: {},
      status: 500,
      error: {
        code: 'get_resources_failed',
        json: {
          message: (error as Error).message,
        },
      },
    }
  }
}

/**
 * Handler for getting usage for a single resource for a customer's subscription.
 * Validates HTTP method and delegates to FlowgladServer.getResourceUsage().
 */
export const getResourceUsage: SubRouteHandler<
  FlowgladActionKey.GetResourceUsage
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
    const result = await flowgladServer.getResourceUsage(params.data)
    return {
      data: result,
      status: 200,
    }
  } catch (error) {
    return {
      data: {},
      status: 500,
      error: {
        code: 'get_resource_usage_failed',
        json: {
          message: (error as Error).message,
        },
      },
    }
  }
}

/**
 * Handler for claiming resources from a subscription's capacity.
 * Supports anonymous claims (quantity) and named claims (externalId/externalIds).
 * Validates HTTP method and delegates to FlowgladServer.claimResource().
 */
export const claimResource: SubRouteHandler<
  FlowgladActionKey.ClaimResource
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
    const result = await flowgladServer.claimResource(params.data)
    return {
      data: result,
      status: 200,
    }
  } catch (error) {
    return {
      data: {},
      status: 500,
      error: {
        code: 'claim_resource_failed',
        json: {
          message: (error as Error).message,
        },
      },
    }
  }
}

/**
 * Handler for releasing claimed resources back to the subscription's available pool.
 * Supports anonymous release (quantity), named release (externalId/externalIds),
 * and direct release (claimIds).
 * Validates HTTP method and delegates to FlowgladServer.releaseResource().
 */
export const releaseResource: SubRouteHandler<
  FlowgladActionKey.ReleaseResource
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
    const result = await flowgladServer.releaseResource(params.data)
    return {
      data: result,
      status: 200,
    }
  } catch (error) {
    return {
      data: {},
      status: 500,
      error: {
        code: 'release_resource_failed',
        json: {
          message: (error as Error).message,
        },
      },
    }
  }
}

/**
 * Handler for listing active resource claims for a subscription.
 * Can optionally filter by resource type using resourceSlug.
 * Validates HTTP method and delegates to FlowgladServer.listResourceClaims().
 */
export const listResourceClaims: SubRouteHandler<
  FlowgladActionKey.ListResourceClaims
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
    const result = await flowgladServer.listResourceClaims(
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
        code: 'list_resource_claims_failed',
        json: {
          message: (error as Error).message,
        },
      },
    }
  }
}
