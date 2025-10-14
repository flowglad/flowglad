import {
  type CancelSubscriptionParams,
  type CreateCheckoutSessionParams,
  type CreateSubscriptionParams,
  type CreateUsageEventParams,
  createUsageEventSchema,
  constructCheckFeatureAccess,
  constructCheckUsageBalance,
  type CreateAddPaymentMethodCheckoutSessionParams,
  type CreateProductCheckoutSessionParams,
  type BillingWithChecks,
  SubscriptionExperimentalFields,
  constructGetProduct,
  constructGetPrice,
} from '@flowglad/shared'
import {
  type ClerkFlowgladServerSessionParams,
  type CoreCustomerUser,
  type FlowgladServerSessionParams,
  type NextjsAuthFlowgladServerSessionParams,
  type SupabaseFlowgladServerSessionParams,
} from './types'
import { z } from 'zod'
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
  const providerCount = [
    'nextAuth' in params,
    'supabaseAuth' in params,
    'clerk' in params,
  ].filter(Boolean).length
  if (providerCount > 1) {
    throw new Error(
      'FlowgladError: Only one of nextAuth, supabaseAuth, or clerk may be defined at a time.'
    )
  }
  if (params.getRequestingCustomer) {
    coreCustomerUser = await params.getRequestingCustomer()
  } else {
    if ('nextAuth' in params) {
      coreCustomerUser = await getSessionFromNextAuth(params)
    } else if ('supabaseAuth' in params) {
      coreCustomerUser = await sessionFromSupabaseAuth(params)
    } else if ('clerk' in params) {
      coreCustomerUser = await sessionFromClerkAuth(params)
    }
  }

  const customerSchema = z.object({
    externalId: z.string().min(1),
    name: z.string().min(1),
    email: z.email(),
  })
  const parsedCustomer = customerSchema.safeParse(coreCustomerUser)
  if (!parsedCustomer.success) {
    throw new Error(
      "Unable to derive requesting customer from session. Please check your flowgladServer constructor, in your server's flowglad.ts file. This is an issue with how your user's session data on the server is being mapped to Flowglad requesting customer input.\n\n" +
        'Issues:\n' +
        `${parsedCustomer.error.issues.map((issue) => `- ${issue.path}: ${issue.message}`).join(`\n`)}.\n\n` +
        'Received input:\n' +
        JSON.stringify(coreCustomerUser)
    )
  }
  return parsedCustomer.data
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

  public getRequestingCustomerId = async (): Promise<string> => {
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

  public getBilling = async (): Promise<BillingWithChecks> => {
    const customer = await this.findOrCreateCustomer()
    const rawBilling =
      await this.flowgladNode.customers.retrieveBilling(
        customer.externalId
      )
    const currentSubscriptionsWithExperimental =
      (rawBilling.currentSubscriptions ?? []) as unknown as {
        id: string
        experimental: SubscriptionExperimentalFields
      }[]
    return {
      ...rawBilling,
      checkFeatureAccess: constructCheckFeatureAccess(
        currentSubscriptionsWithExperimental
      ),
      checkUsageBalance: constructCheckUsageBalance(
        currentSubscriptionsWithExperimental
      ),
      getProduct: constructGetProduct(rawBilling.catalog),
      getPrice: constructGetPrice(rawBilling.catalog),
    }
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
      const errorCode = (error as any)?.error?.code
      if (errorCode === 'NOT_FOUND') {
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
    return await this.flowgladNode.customers.create(params)
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
      checkoutSession: {
        ...params,
        customerExternalId: session.externalId,
      },
    })
  }

  public updateCustomer = async (
    params: FlowgladNode.Customers.CustomerUpdateParams
  ): Promise<FlowgladNode.Customers.CustomerUpdateResponse> => {
    const session = await getSessionFromParams(
      this.createHandlerParams
    )
    if (!session) {
      throw new Error('User not authenticated')
    }
    return this.flowgladNode.customers.update(
      session.externalId,
      params
    )
  }

  public createAddPaymentMethodCheckoutSession = async (
    params: CreateAddPaymentMethodCheckoutSessionParams
  ): Promise<FlowgladNode.CheckoutSessions.CheckoutSessionCreateResponse> => {
    return this.createCheckoutSession({
      ...params,
      type: 'add_payment_method',
    })
  }

  public createProductCheckoutSession = async (
    params: CreateProductCheckoutSessionParams
  ): Promise<FlowgladNode.CheckoutSessions.CheckoutSessionCreateResponse> => {
    return this.createCheckoutSession({ ...params, type: 'product' })
  }

  public cancelSubscription = async (
    params: CancelSubscriptionParams
  ): Promise<FlowgladNode.Subscriptions.SubscriptionCancelResponse> => {
    const { subscription } =
      await this.flowgladNode.subscriptions.retrieve(params.id)
    if (subscription.status === 'canceled') {
      throw new Error('Subscription is already canceled')
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

  public createSubscription = async (
    params: Omit<CreateSubscriptionParams, 'customerId'>
  ): Promise<FlowgladNode.Subscriptions.SubscriptionCreateResponse> => {
    const customer = await this.findOrCreateCustomer()
    const rawParams = {
      ...params,
      quantity: params.quantity ?? 1,
      customerId: customer.id,
    }
    // const parsedParams = createSubscriptionSchema.parse(rawParams)
    // @ts-ignore
    return this.flowgladNode.subscriptions.create(rawParams)
  }

  /**
   * Create a usage event for a customer.
   * NOTE: this method makes two API calls, including one to get the customer.
   * If you are to create usages en masse with minimum latency,
   * you should use `FlowgladServerAdmin.createUsageEvent` instead.
   * @param params - The parameters for the usage event.
   * @returns The created usage event.
   */
  public createUsageEvent = async (
    params: CreateUsageEventParams
  ): Promise<FlowgladNode.UsageEvents.UsageEventCreateResponse> => {
    const parsedParams = createUsageEventSchema.parse(params)
    return this.flowgladNode.usageEvents.create({
      usageEvent: {
        ...parsedParams,
        usageDate: parsedParams.usageDate || undefined,
      },
    })
  }

  public getCatalog =
    async (): Promise<FlowgladNode.Catalogs.CatalogRetrieveResponse> => {
      const billing = await this.getBilling()
      return { catalog: billing.catalog }
    }
}
