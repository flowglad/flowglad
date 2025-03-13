import { FlowgladServer } from '../flowgladServer'
import { FlowgladActionKey, HTTPMethod } from '@flowglad/shared'
import type { SubRouteHandler } from './types'

export const getCustomerProfileBilling: SubRouteHandler<
  FlowgladActionKey.GetCustomerProfileBilling
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
  const customerProfileBilling = await flowgladServer.getBilling()
  return {
    data: customerProfileBilling,
    status: 200,
  }
}

export const findOrCreateCustomerProfile: SubRouteHandler<
  FlowgladActionKey.FindOrCreateCustomerProfile
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
  let customerProfile
  const requestingcustomerProfileId =
    await flowgladServer.getRequestingcustomerProfileId()
  try {
    customerProfile = await flowgladServer.getCustomerProfile()
  } catch (error) {
    if ((error as any).error.code === 'NOT_FOUND') {
      customerProfile = await flowgladServer.createCustomerProfile({
        customerProfile: {
          email: user.email,
          name: user.name,
          externalId: requestingcustomerProfileId,
        },
      })
    }
  }
  if (!customerProfile) {
    return {
      data: {},
      status: 404,
      error: {
        code: '404',
        json: {
          message: `Customer profile ${requestingcustomerProfileId} not found`,
        },
      },
    }
  }
  return {
    data: customerProfile,
    status: 200,
  }
}
