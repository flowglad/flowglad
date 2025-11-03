import {
  FlowgladActionKey,
  HTTPMethod,
  createAddPaymentMethodCheckoutSessionSchema,
  createActivateSubscriptionCheckoutSessionSchema,
} from '@flowglad/shared'
import {
  InferRouteHandlerParams,
  SubRouteHandler,
  SubRouteHandlerResultData,
} from './types'
import { FlowgladServer } from '../FlowgladServer'
import { parseErrorStringToErrorObject } from '../serverUtils'

const createCheckoutSession: SubRouteHandler<
  FlowgladActionKey.CreateCheckoutSession
> = async (params, flowgladServer: FlowgladServer) => {
  let error:
    | { code: string; json: Record<string, unknown> }
    | undefined
  let status: number
  let data: SubRouteHandlerResultData<FlowgladActionKey.CreateCheckoutSession> =
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
    const checkoutSession =
      await flowgladServer.createCheckoutSession(params.data)
    data = checkoutSession
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

const createAddPaymentMethodCheckoutSession: SubRouteHandler<
  FlowgladActionKey.CreateAddPaymentMethodCheckoutSession
> = async (params, flowgladServer: FlowgladServer) => {
  let error:
    | { code: string; json: Record<string, unknown> }
    | undefined
  let status: number
  let data: SubRouteHandlerResultData<FlowgladActionKey.CreateAddPaymentMethodCheckoutSession> =
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
  const parsedParams =
    createAddPaymentMethodCheckoutSessionSchema.parse(params.data)
  try {
    const checkoutSession =
      await flowgladServer.createAddPaymentMethodCheckoutSession(
        parsedParams
      )
    data = checkoutSession
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

const createActivateSubscriptionCheckoutSession: SubRouteHandler<
  FlowgladActionKey.CreateActivateSubscriptionCheckoutSession
> = async (params, flowgladServer: FlowgladServer) => {
  let error:
    | { code: string; json: Record<string, unknown> }
    | undefined
  let status: number
  let data: SubRouteHandlerResultData<FlowgladActionKey.CreateActivateSubscriptionCheckoutSession> =
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
  const parsedParams =
    createActivateSubscriptionCheckoutSessionSchema.parse(params.data)
  try {
    const checkoutSession =
      await flowgladServer.createActivateSubscriptionCheckoutSession(
        parsedParams
      )
    data = checkoutSession
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

export {
  createCheckoutSession,
  createAddPaymentMethodCheckoutSession,
  createActivateSubscriptionCheckoutSession,
}
