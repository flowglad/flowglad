import type Flowglad from '@flowglad/node'
import {
  type FlowgladActionKey,
  type GetSubscriptionsResponse,
  HTTPMethod,
} from '@flowglad/shared'
import type { FlowgladServer } from '../FlowgladServer'
import type {
  SubRouteHandler,
  SubRouteHandlerResultData,
} from './types'

export const cancelSubscription: SubRouteHandler<
  FlowgladActionKey.CancelSubscription
> = async (params, flowgladServer: FlowgladServer) => {
  let error:
    | { code: string; json: Record<string, unknown> }
    | undefined
  let status: number
  const data: SubRouteHandlerResultData<FlowgladActionKey.CancelSubscription> =
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
  let subscription: Flowglad.Subscriptions.SubscriptionCancelResponse
  try {
    subscription = await flowgladServer.cancelSubscription(
      params.data
    )
    return {
      data: subscription,
      status: 200,
    }
  } catch (error) {
    return {
      data: {},
      status: 500,
      error: {
        code: 'subscription_cancel_failed',
        json: {
          message: (error as Error).message,
        },
      },
    }
  }
}

export const uncancelSubscription: SubRouteHandler<
  FlowgladActionKey.UncancelSubscription
> = async (params, flowgladServer: FlowgladServer) => {
  let error:
    | { code: string; json: Record<string, unknown> }
    | undefined
  let status: number
  const data: SubRouteHandlerResultData<FlowgladActionKey.UncancelSubscription> =
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
  let subscription: Flowglad.Subscriptions.SubscriptionUncancelResponse
  try {
    subscription = await flowgladServer.uncancelSubscription(
      params.data
    )
    return {
      data: subscription,
      status: 200,
    }
  } catch (error) {
    return {
      data: {},
      status: 500,
      error: {
        code: 'subscription_uncancel_failed',
        json: {
          message: (error as Error).message,
        },
      },
    }
  }
}

export const adjustSubscription: SubRouteHandler<
  FlowgladActionKey.AdjustSubscription
> = async (params, flowgladServer: FlowgladServer) => {
  const data: SubRouteHandlerResultData<FlowgladActionKey.AdjustSubscription> =
    {}
  if (params.method !== HTTPMethod.POST) {
    return {
      data,
      status: 405,
      error: {
        code: 'Method not allowed',
        json: {},
      },
    }
  }
  try {
    const result = await flowgladServer.adjustSubscription(
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
        code: 'subscription_adjust_failed',
        json: {
          message: (error as Error).message,
        },
      },
    }
  }
}

export const getSubscriptions: SubRouteHandler<
  FlowgladActionKey.GetSubscriptions
> = async (params, flowgladServer) => {
  const emptyData: GetSubscriptionsResponse = {
    subscriptions: [],
    currentSubscriptions: [],
    currentSubscription: null,
  }
  if (params.method !== HTTPMethod.POST) {
    return {
      data: emptyData,
      status: 405,
      error: {
        code: 'Method not allowed',
        json: {},
      },
    }
  }
  try {
    const result = await flowgladServer.getSubscriptions(params.data)
    return {
      data: result,
      status: 200,
    }
  } catch (error) {
    return {
      data: emptyData,
      status: 500,
      error: {
        code: 'subscription_list_failed',
        json: {
          message: (error as Error).message,
        },
      },
    }
  }
}
