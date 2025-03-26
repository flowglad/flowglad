import {
  CancelSubscriptionParams,
  CreateCheckoutSessionParams,
} from '@flowglad/shared'
import {
  ClerkFlowgladServerSessionParams,
  CoreCustomerUser,
  FlowgladServerSessionParams,
  NextjsAuthFlowgladServerSessionParams,
  SupabaseFlowgladServerSessionParams,
} from './types'

import { Flowglad as FlowgladNode } from '@flowglad/node'

const getSessionFromNextAuth = async (
  params: NextjsAuthFlowgladServerSessionParams
) => {
  let coreCustomerUser: CoreCustomerUser | null = null
  const session = await params.nextAuth.auth()
  if (session?.user) {
    if (params.nextAuth.customerFromAuth) {
      coreCustomerUser =
        await params.nextAuth.customerFromAuth(session)
    } else {
      if (!session.user.email) {
        throw new Error(
          'FlowgladError: NextAuth session has no email. Please provide an extractUserIdFromSession function to extract the userId from the session, or include email on your sessions.'
        )
      }
      coreCustomerUser = {
        externalId: session.user.email,
        name: session.user.name || '',
        email: session.user.email || '',
      }
    }
  }
  return coreCustomerUser
}

const getSessionFromNextAuth4 = async (
  params: NextjsAuthFlowgladServerSessionParams
) => {
  const session = await params.nextAuth.auth()
  return session
}

const sessionFromSupabaseAuth = async (
  params: SupabaseFlowgladServerSessionParams
) => {
  let coreCustomerUser: CoreCustomerUser | null = null
  const {
    data: { user },
  } = await (await params.supabaseAuth.client()).auth.getUser()
  if (user) {
    coreCustomerUser = {
      externalId: user.id,
      name: user.user_metadata.name || '',
      email: user.email || '',
    }
  }
  return coreCustomerUser
}

const sessionFromClerkAuth = async (
  params: ClerkFlowgladServerSessionParams
) => {
  let coreCustomerUser: CoreCustomerUser | null = null
  const session = await params.clerk.currentUser()
  if (params.clerk.customerFromCurrentUser && session) {
    coreCustomerUser =
      await params.clerk.customerFromCurrentUser(session)
  } else if (session) {
    coreCustomerUser = {
      externalId: session.id,
      name: session.firstName || '',
      email: session.emailAddresses[0].emailAddress || '',
    }
  }
  return coreCustomerUser
}

const getSessionFromParams = async (
  params: FlowgladServerSessionParams
) => {
  let coreCustomerUser: CoreCustomerUser | null = null
  if ('nextAuth' in params) {
    coreCustomerUser = await getSessionFromNextAuth(params)
  } else if ('supabaseAuth' in params) {
    coreCustomerUser = await sessionFromSupabaseAuth(params)
  } else if ('clerk' in params) {
    coreCustomerUser = await sessionFromClerkAuth(params)
  } else if (params.getRequestingCustomer) {
    coreCustomerUser = await params.getRequestingCustomer()
  }
  return coreCustomerUser
}

export class FlowgladServer {
  private createHandlerParams: FlowgladServerSessionParams
  private flowgladNode: FlowgladNode
  constructor(createHandlerParams: FlowgladServerSessionParams) {
    this.createHandlerParams = createHandlerParams
    this.flowgladNode = new FlowgladNode({
      apiKey: createHandlerParams.apiKey,
      baseURL: createHandlerParams.baseURL,
    })
  }

  public getRequestingcustomerId = async (): Promise<string> => {
    if (this.createHandlerParams.getRequestingCustomer) {
      const customer =
        await this.createHandlerParams.getRequestingCustomer()
      if (customer) {
        return customer.externalId
      }
    }
    const session = await getSessionFromParams(
      this.createHandlerParams
    )
    if (!session) {
      throw new Error('User not authenticated')
    }
    return session.externalId
  }

  public getSession = async (): Promise<CoreCustomerUser | null> => {
    return getSessionFromParams(this.createHandlerParams)
  }

  public getBilling =
    async (): Promise<FlowgladNode.Customers.CustomerRetrieveBillingResponse> => {
      const customer = await this.findOrCreateCustomer()
      return this.flowgladNode.customers.retrieveBilling(
        customer.externalId
      )
    }

  public findOrCreateCustomer = async (): Promise<
    FlowgladNode.Customers.CustomerRetrieveResponse['customer']
  > => {
    let customer:
      | FlowgladNode.Customers.CustomerRetrieveResponse['customer']
      | null = null
    try {
      const getResult = await this.getCustomer()
      customer = getResult.customer
    } catch (error) {
      if ((error as any).error.code === 'NOT_FOUND') {
        const session = await getSessionFromParams(
          this.createHandlerParams
        )
        if (!session) {
          throw new Error('User not authenticated')
        }
        const createResult = await this.createCustomer({
          customer: {
            email: session.email,
            name: session.name,
            externalId: session.externalId,
          },
        })
        customer = createResult.data.customer
      } else {
        throw error
      }
    }
    if (!customer) {
      throw new Error('Customer not found')
    }
    return customer
  }

  public getCustomer =
    async (): Promise<FlowgladNode.Customers.CustomerRetrieveResponse> => {
      const session = await getSessionFromParams(
        this.createHandlerParams
      )
      if (!session) {
        throw new Error('User not authenticated')
      }
      return this.flowgladNode.customers.retrieve(session.externalId)
    }
  public createCustomer = async (
    params: FlowgladNode.Customers.CustomerCreateParams
  ): Promise<FlowgladNode.Customers.CustomerCreateResponse> => {
    return this.flowgladNode.customers.create(params)
  }
  public createCheckoutSession = async (
    params: CreateCheckoutSessionParams
  ): Promise<FlowgladNode.CheckoutSessions.CheckoutSessionCreateResponse> => {
    const session = await getSessionFromParams(
      this.createHandlerParams
    )
    if (!session) {
      throw new Error('User not authenticated')
    }
    return this.flowgladNode.checkoutSessions.create({
      customerExternalId: session.externalId,
      priceId: params.priceId,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      outputMetadata: params.outputMetadata,
      outputName: params.outputName,
    })
  }

  public cancelSubscription = async (
    params: CancelSubscriptionParams
  ): Promise<FlowgladNode.Subscriptions.SubscriptionCancelResponse> => {
    const { subscription } =
      await this.flowgladNode.subscriptions.retrieve(params.id)
    if (subscription.status !== 'active') {
      throw new Error('Subscription is not active')
    }
    const { customer } = await this.getCustomer()
    if (subscription.customerId !== customer.id) {
      throw new Error('Subscription is not owned by the current user')
    }
    return this.flowgladNode.subscriptions.cancel(params.id, {
      cancellation:
        params.cancellation as FlowgladNode.Subscriptions.SubscriptionCancelParams['cancellation'],
    })
  }
}
