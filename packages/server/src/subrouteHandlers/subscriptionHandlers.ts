import { FlowgladActionKey, HTTPMethod } from '@flowglad/shared'
import { SubRouteHandler, SubRouteHandlerResultData } from './types'
import { FlowgladServer } from '../FlowgladServer'
import Flowglad from '@flowglad/node'

export const cancelSubscription: SubRouteHandler<
  FlowgladActionKey.CancelSubscription
> = async (params, flowgladServer: FlowgladServer) => {
  let error:
    | { code: string; json: Record<string, unknown> }
    | undefined
  let status: number
  let data: SubRouteHandlerResultData<FlowgladActionKey.CancelSubscription> =
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
