import { FlowgladServer } from '../flowgladServer'
import { FlowgladActionKey, HTTPMethod } from '@flowglad/shared'
import type { SubRouteHandler } from './types'

export const getCustomerBilling: SubRouteHandler<
  FlowgladActionKey.GetCustomerBilling
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
  const customerBilling = await flowgladServer.getBilling()
  return {
    data: customerBilling,
    status: 200,
  }
}

export const findOrCreateCustomer: SubRouteHandler<
  FlowgladActionKey.FindOrCreateCustomer
> = async (params, flowgladServer: FlowgladServer) => {
  if (params.method !== HTTPMethod.POST) {
    return {
      data: {},
      status: 405,
      error: {
        code: '405',
        json: {
          message: 'Method not allowed',
        },
      },
    }
  }
  const user = await flowgladServer.getSession()
  if (!user) {
    return {
      data: {},
      status: 401,
      error: {
        code: '401',
        json: {
          message: 'Unauthorized',
        },
      },
    }
  }
  let customer
  const requestingcustomerId =
    await flowgladServer.getRequestingcustomerId()
  try {
    customer = await flowgladServer.getCustomer()
  } catch (error) {
    if ((error as any).error.code === 'NOT_FOUND') {
      customer = await flowgladServer.createCustomer({
        customer: {
          email: user.email,
          name: user.name,
          externalId: requestingcustomerId,
        },
      })
    }
  }
  if (!customer) {
    return {
      data: {},
      status: 404,
      error: {
        code: '404',
        json: {
          message: `Customer ${requestingcustomerId} not found`,
        },
      },
    }
  }
  return {
    data: customer,
    status: 200,
  }
}
