import { Flowglad as FlowgladNode } from '@flowglad/node'
import {
  type BillingWithChecks,
  type CancelSubscriptionParams,
  type CreateActivateSubscriptionCheckoutSessionParams,
  type CreateAddPaymentMethodCheckoutSessionParams,
  type CreateProductCheckoutSessionParams,
  type CreateSubscriptionParams,
  type CreateUsageEventParams,
  constructCheckFeatureAccess,
  constructCheckUsageBalance,
  constructGetPrice,
  constructGetProduct,
  createActivateSubscriptionCheckoutSessionSchema,
  createAddPaymentMethodCheckoutSessionSchema,
  createProductCheckoutSessionSchema,
  createUsageEventSchema,
  type SubscriptionExperimentalFields,
  type UncancelSubscriptionParams,
} from '@flowglad/shared'
import { getSessionFromParams } from './serverUtils'
import type {
  CoreCustomerUser,
  FlowgladServerSessionParams,
} from './types'

export class FlowgladServer {
  private createHandlerParams: FlowgladServerSessionParams
  private flowgladNode: FlowgladNode
  private scopedParams?: {
    customerExternalId: string
    getCustomerDetails: (customerExternalId: string) => Promise<{
      name: string
      email: string
    }>
  }
  constructor(createHandlerParams: FlowgladServerSessionParams) {
    this.createHandlerParams = createHandlerParams
    this.flowgladNode = new FlowgladNode({
      apiKey: createHandlerParams.apiKey,
      baseURL: createHandlerParams.baseURL,
    })
    // Detect and store scoped server params
    if ('customerExternalId' in createHandlerParams) {
      this.scopedParams = {
        customerExternalId: createHandlerParams.customerExternalId,
        getCustomerDetails: createHandlerParams.getCustomerDetails,
      }
    }
  }

  public getRequestingCustomerId = async (): Promise<string> => {
    if (
      'getRequestingCustomer' in this.createHandlerParams &&
      this.createHandlerParams.getRequestingCustomer
    ) {
      const customer =
        await this.createHandlerParams.getRequestingCustomer()
      if (customer) {
        return customer.externalId
      }
    }
    const session = await getSessionFromParams(
      this.createHandlerParams,
      this.scopedParams?.customerExternalId
    )
    if (!session) {
      throw new Error('User not authenticated')
    }
    return session.externalId
  }

  public getSession = async (): Promise<CoreCustomerUser | null> => {
    return getSessionFromParams(
      this.createHandlerParams,
      this.scopedParams?.customerExternalId
    )
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
    console.log('[findOrCreateCustomer] Starting function execution')
    console.log('[findOrCreateCustomer] scopedParams:', {
      hasScopedParams: !!this.scopedParams,
      customerExternalId: this.scopedParams?.customerExternalId,
    })

    let customer:
      | FlowgladNode.Customers.CustomerRetrieveResponse['customer']
      | null = null

    try {
      console.log(
        '[findOrCreateCustomer] Attempting to retrieve existing customer via getCustomer()'
      )
      const getResult = await this.getCustomer()
      console.log('[findOrCreateCustomer] getCustomer() succeeded:', {
        customerId: getResult.customer?.id,
        customerExternalId: getResult.customer?.externalId,
        customerEmail: getResult.customer?.email,
        customerName: getResult.customer?.name,
        getResult,
      })
      customer = getResult.customer
      console.log(
        '[findOrCreateCustomer] Customer retrieved successfully, skipping creation'
      )
    } catch (error) {
      console.log(
        '[findOrCreateCustomer] getCustomer() failed, error details:',
        {
          error: error,
          errorMessage:
            error instanceof Error ? error.message : String(error),
          errorStack:
            error instanceof Error ? error.stack : undefined,
          errorType: error?.constructor?.name,
          errorCode: (error as any)?.error?.code,
          fullErrorObject: JSON.stringify(
            error,
            Object.getOwnPropertyNames(error)
          ),
        }
      )

      const errorCode = (error as any)?.error?.code
      console.log(
        '[findOrCreateCustomer] Extracted errorCode:',
        errorCode
      )

      if (errorCode === 'NOT_FOUND') {
        console.log(
          '[findOrCreateCustomer] Error is NOT_FOUND, proceeding to create customer'
        )
        console.log('[findOrCreateCustomer] Checking scopedParams:', {
          hasScopedParams: !!this.scopedParams,
        })

        if (this.scopedParams) {
          console.log(
            '[findOrCreateCustomer] Using scopedParams path'
          )
          console.log(
            '[findOrCreateCustomer] Calling getCustomerDetails with:',
            {
              customerExternalId:
                this.scopedParams.customerExternalId,
            }
          )

          try {
            const customerDetails =
              await this.scopedParams.getCustomerDetails(
                this.scopedParams.customerExternalId
              )
            console.log(
              '[findOrCreateCustomer] getCustomerDetails succeeded:',
              {
                email: customerDetails.email,
                name: customerDetails.name,
              }
            )

            const createParams = {
              customer: {
                email: customerDetails.email,
                name: customerDetails.name,
                externalId: this.scopedParams.customerExternalId,
              },
            }
            console.log(
              '[findOrCreateCustomer] Creating customer with params:',
              createParams
            )

            const createResult =
              await this.createCustomer(createParams)
            console.log(
              '[findOrCreateCustomer] createCustomer succeeded:',
              {
                customerId: createResult.data.customer?.id,
                customerExternalId:
                  createResult.data.customer?.externalId,
                customerEmail: createResult.data.customer?.email,
                customerName: createResult.data.customer?.name,
                createResult,
              }
            )
            customer = createResult.data.customer
          } catch (createError) {
            console.log(
              '[findOrCreateCustomer] Error during scopedParams customer creation:',
              {
                error: createError,
                errorMessage:
                  createError instanceof Error
                    ? createError.message
                    : String(createError),
                errorStack:
                  createError instanceof Error
                    ? createError.stack
                    : undefined,
                errorType: createError?.constructor?.name,
                fullErrorObject: JSON.stringify(
                  createError,
                  Object.getOwnPropertyNames(createError)
                ),
              }
            )
            throw createError
          }
        } else {
          console.log(
            '[findOrCreateCustomer] Using session-based path (no scopedParams)'
          )
          console.log(
            '[findOrCreateCustomer] Retrieving session from params'
          )

          try {
            const session = await getSessionFromParams(
              this.createHandlerParams,
              undefined
            )
            console.log(
              '[findOrCreateCustomer] getSessionFromParams result:',
              {
                hasSession: !!session,
                sessionExternalId: session?.externalId,
                sessionEmail: session?.email,
                sessionName: session?.name,
              }
            )

            if (!session) {
              console.log(
                '[findOrCreateCustomer] Session is null, throwing authentication error'
              )
              throw new Error('User not authenticated')
            }

            const createParams = {
              customer: {
                email: session.email,
                name: session.name,
                externalId: session.externalId,
              },
            }
            console.log(
              '[findOrCreateCustomer] Creating customer with params:',
              createParams
            )

            const createResult =
              await this.createCustomer(createParams)
            console.log(
              '[findOrCreateCustomer] createCustomer succeeded:',
              {
                customerId: createResult.data.customer?.id,
                customerExternalId:
                  createResult.data.customer?.externalId,
                customerEmail: createResult.data.customer?.email,
                customerName: createResult.data.customer?.name,
              }
            )
            customer = createResult.data.customer
          } catch (createError) {
            console.log(
              '[findOrCreateCustomer] Error during session-based customer creation:',
              {
                error: createError,
                errorMessage:
                  createError instanceof Error
                    ? createError.message
                    : String(createError),
                errorStack:
                  createError instanceof Error
                    ? createError.stack
                    : undefined,
                errorType: createError?.constructor?.name,
                fullErrorObject: JSON.stringify(
                  createError,
                  Object.getOwnPropertyNames(createError)
                ),
              }
            )
            throw createError
          }
        }
      } else {
        console.log(
          '[findOrCreateCustomer] Error code is not NOT_FOUND, re-throwing error'
        )
        console.log(
          '[findOrCreateCustomer] Non-NOT_FOUND error details:',
          {
            errorCode,
            error: error,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          }
        )
        throw error
      }
    }

    console.log('[findOrCreateCustomer] Final customer state:', {
      hasCustomer: !!customer,
      customerId: customer?.id,
      customerExternalId: customer?.externalId,
      customerEmail: customer?.email,
      customerName: customer?.name,
    })

    if (!customer) {
      console.log(
        '[findOrCreateCustomer] ERROR: Customer is null after all operations'
      )
      throw new Error('Customer not found')
    }

    console.log(
      '[findOrCreateCustomer] Function completed successfully, returning customer'
    )
    return customer
  }

  public getCustomer =
    async (): Promise<FlowgladNode.Customers.CustomerRetrieveResponse> => {
      const session = await getSessionFromParams(
        this.createHandlerParams,
        this.scopedParams?.customerExternalId
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

  /**
   * Create a checkout session.
   * You can provide either `priceId` or `priceSlug` (but not both).
   * @param params - Checkout session parameters. Must include either `priceId` or `priceSlug`, plus `successUrl` and `cancelUrl`.
   * @returns The created checkout session with a URL for redirecting the customer.
   */
  public createCheckoutSession = async (
    params: CreateProductCheckoutSessionParams
  ): Promise<FlowgladNode.CheckoutSessions.CheckoutSessionCreateResponse> => {
    const session = await getSessionFromParams(
      this.createHandlerParams,
      this.scopedParams?.customerExternalId
    )
    if (!session) {
      throw new Error('User not authenticated')
    }

    const parsedParams = createProductCheckoutSessionSchema.parse({
      ...params,
      type: 'product',
      customerExternalId: session.externalId,
    })

    return this.flowgladNode.checkoutSessions.create({
      checkoutSession: {
        ...parsedParams,
        type: 'product',
        customerExternalId: session.externalId,
      },
    })
  }

  public updateCustomer = async (
    params: FlowgladNode.Customers.CustomerUpdateParams
  ): Promise<FlowgladNode.Customers.CustomerUpdateResponse> => {
    const session = await getSessionFromParams(
      this.createHandlerParams,
      this.scopedParams?.customerExternalId
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
    const session = await getSessionFromParams(
      this.createHandlerParams,
      this.scopedParams?.customerExternalId
    )
    if (!session) {
      throw new Error('User not authenticated')
    }
    const parsedParams =
      createAddPaymentMethodCheckoutSessionSchema.parse(params)
    return await this.flowgladNode.checkoutSessions.create({
      checkoutSession: {
        ...parsedParams,
        type: 'add_payment_method',
        customerExternalId: session.externalId,
      },
    })
  }

  public createActivateSubscriptionCheckoutSession = async (
    params: CreateActivateSubscriptionCheckoutSessionParams
  ): Promise<FlowgladNode.CheckoutSessions.CheckoutSessionCreateResponse> => {
    const session = await getSessionFromParams(
      this.createHandlerParams,
      this.scopedParams?.customerExternalId
    )
    if (!session) {
      throw new Error('User not authenticated')
    }
    const parsedParams =
      createActivateSubscriptionCheckoutSessionSchema.parse(params)

    return await this.flowgladNode.checkoutSessions.create({
      checkoutSession: {
        ...parsedParams,
        type: 'activate_subscription',
        customerExternalId: session.externalId,
      },
    })
  }

  public cancelSubscription = async (
    params: CancelSubscriptionParams
  ): Promise<FlowgladNode.Subscriptions.SubscriptionCancelResponse> => {
    const { subscription } =
      await this.flowgladNode.subscriptions.retrieve(params.id)

    const { customer } = await this.getCustomer()
    if (subscription.customerId !== customer.id) {
      throw new Error('Subscription is not owned by the current user')
    }

    if (subscription.status === 'canceled') {
      throw new Error('Subscription is already canceled')
    }

    return this.flowgladNode.subscriptions.cancel(params.id, {
      cancellation:
        params.cancellation as FlowgladNode.Subscriptions.SubscriptionCancelParams['cancellation'],
    })
  }

  /**
   * Uncancel a subscription that is scheduled for cancellation.
   *
   * @param params - Parameters containing the subscription ID to uncancel
   * @returns The uncanceled subscription
   * @throws {Error} If the subscription is not owned by the authenticated customer
   *
   * Note: This method is idempotent. If the subscription is not in 'cancellation_scheduled'
   * status, it returns the subscription without modification.
   */
  public uncancelSubscription = async (
    params: UncancelSubscriptionParams
  ): Promise<FlowgladNode.Subscriptions.SubscriptionUncancelResponse> => {
    const { subscription } =
      await this.flowgladNode.subscriptions.retrieve(params.id)

    const { customer } = await this.getCustomer()
    if (subscription.customerId !== customer.id) {
      throw new Error('Subscription is not owned by the current user')
    }

    // Validation: Check if subscription is scheduled to cancel
    if (subscription.status !== 'cancellation_scheduled') {
      // Idempotent: silently succeed if not scheduled to cancel
      return { subscription }
    }

    // Pass an empty body to ensure Content-Type: application/json is set
    return this.flowgladNode.subscriptions.uncancel(params.id, {
      body: {},
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
        properties: parsedParams.properties ?? undefined,
        usageDate: parsedParams.usageDate || undefined,
      },
    })
  }

  public getPricingModel = async (): Promise<{
    pricingModel: FlowgladNode.PricingModels.PricingModelRetrieveResponse['pricingModel']
  }> => {
    const billing = await this.getBilling()
    return { pricingModel: billing.pricingModel }
  }
}
