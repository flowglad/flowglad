import { type FlowgladActionKey, HTTPMethod } from '@flowglad/shared'
import { nanoid } from 'nanoid'
import type { FlowgladServer } from '../FlowgladServer'
import { parseErrorStringToErrorObject } from '../serverUtils'
import type {
  SubRouteHandler,
  SubRouteHandlerResultData,
} from './types'

export const createUsageEvent: SubRouteHandler<
  FlowgladActionKey.CreateUsageEvent
> = async (params, flowgladServer: FlowgladServer) => {
  let error:
    | { code: string; json: Record<string, unknown> }
    | undefined
  let status: number
  let data: SubRouteHandlerResultData<FlowgladActionKey.CreateUsageEvent> =
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
    // Get billing context for defaults
    const billing = await flowgladServer.getBilling()
    const currentSubscription = billing.currentSubscription

    // Apply defaults
    const subscriptionId =
      params.data.subscriptionId ?? currentSubscription?.id
    if (!subscriptionId) {
      return {
        data: {},
        status: 400,
        error: {
          code: 'missing_subscription_id',
          json: {
            message:
              'subscriptionId required: no current subscription found',
          },
        },
      }
    }

    // Validate subscription ownership (align with bulkCreateUsageEvents)
    const customerSubscriptionIds =
      billing.currentSubscriptions?.map((sub) => sub.id) ?? []
    if (!customerSubscriptionIds.includes(subscriptionId)) {
      return {
        data: {},
        status: 403,
        error: {
          code: 'forbidden',
          json: {
            message: `Subscription ${subscriptionId} is not found among the customer's current subscriptions`,
          },
        },
      }
    }

    const resolvedParams = {
      ...params.data,
      subscriptionId,
      amount: params.data.amount ?? 1,
      transactionId: params.data.transactionId ?? nanoid(),
    }

    const usageEvent =
      await flowgladServer.createUsageEvent(resolvedParams)
    data = usageEvent
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
