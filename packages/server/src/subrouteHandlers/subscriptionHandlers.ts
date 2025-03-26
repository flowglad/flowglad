import { FlowgladActionKey, HTTPMethod } from '@flowglad/shared'
import { SubRouteHandler, SubRouteHandlerResultData } from './types'
import { FlowgladServer } from '../FlowgladServer'

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
  console.log(
    '====subscriptionHandlers.cancelSubscription params',
    params
  )
  const subscription = await flowgladServer.cancelSubscription(
    params.data
  )

  return {
    data: subscription,
    status: 200,
  }
}
