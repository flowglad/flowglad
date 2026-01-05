import { Flowglad as FlowgladNode } from '@flowglad/node'
import {
  type AdjustSubscriptionOptions,
  type BillingWithChecks,
  type BulkCreateUsageEventsParams,
  bulkCreateUsageEventsSchema,
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
  constructHasPurchased,
  createActivateSubscriptionCheckoutSessionSchema,
  createAddPaymentMethodCheckoutSessionSchema,
  createProductCheckoutSessionSchema,
  createUsageEventSchema,
  type SubscriptionExperimentalFields,
  subscriptionAdjustmentTiming,
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
      hasPurchased: constructHasPurchased(
        rawBilling.catalog,
        rawBilling.purchases
      ),
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
        if (this.scopedParams) {
          const customerDetails =
            await this.scopedParams.getCustomerDetails(
              this.scopedParams.customerExternalId
            )
          const createResult = await this.createCustomer({
            customer: {
              email: customerDetails.email,
              name: customerDetails.name,
              externalId: this.scopedParams.customerExternalId,
            },
          })
          customer = createResult.data.customer
        } else {
          const session = await getSessionFromParams(
            this.createHandlerParams,
            undefined
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
        }
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

  /**
   * Adjust a subscription to a different price.
   *
   * @example
   * // TERSEST form: adjust current subscription (auto-resolves if customer has 1 subscription)
   * await flowglad.adjustSubscription('pro-monthly')
   *
   * // With quantity (for multi-seat plans)
   * await flowglad.adjustSubscription('pro-monthly', { quantity: 5 })
   *
   * // With explicit timing override
   * await flowglad.adjustSubscription('pro-monthly', { timing: 'at_end_of_period' })
   *
   * // Explicit subscription ID (required for multi-subscription customers)
   * await flowglad.adjustSubscription('pro-monthly', { subscriptionId: 'sub_123' })
   *
   * @param priceIdOrSlug - The price ID or price slug to adjust to
   * @param options - Optional adjustment options
   * @param options.subscriptionId - Subscription ID (auto-resolves if customer has exactly 1 subscription)
   * @param options.quantity - Number of units (default: 1)
   * @param options.timing - 'immediately' | 'at_end_of_period' | 'auto' (default: 'auto')
   *   - 'auto': Upgrades happen immediately, downgrades at end of period
   *   - 'immediately': Apply change now with proration
   *   - 'at_end_of_period': Apply change at next billing period
   * @param options.prorate - Whether to prorate (default: true for immediate, false for end-of-period)
   * @returns The adjusted subscription and its items
   * @throws {Error} If customer has no active subscriptions
   * @throws {Error} If customer has multiple subscriptions and subscriptionId not provided
   * @throws {Error} If the subscription is not owned by the authenticated customer
   */
  public adjustSubscription = async (
    priceIdOrSlug: string,
    options?: AdjustSubscriptionOptions
  ): Promise<FlowgladNode.Subscriptions.SubscriptionAdjustResponse> => {
    // Auto-resolve subscriptionId if not provided
    let subscriptionId = options?.subscriptionId

    if (!subscriptionId) {
      const billing = await this.getBilling()
      const currentSubscriptions = billing.currentSubscriptions ?? []

      if (currentSubscriptions.length === 0) {
        throw new Error(
          'No active subscription found for this customer'
        )
      }
      if (currentSubscriptions.length > 1) {
        throw new Error(
          'Customer has multiple active subscriptions. Please specify subscriptionId in options.'
        )
      }
      subscriptionId = currentSubscriptions[0].id
    }

    // Validate ownership
    const { subscription } =
      await this.flowgladNode.subscriptions.retrieve(subscriptionId)

    const { customer } = await this.getCustomer()
    if (subscription.customerId !== customer.id) {
      throw new Error('Subscription is not owned by the current user')
    }

    const quantity = options?.quantity ?? 1
    const timing =
      options?.timing ?? subscriptionAdjustmentTiming.Auto
    const prorate = options?.prorate

    const serverTiming =
      timing === subscriptionAdjustmentTiming.Immediately
        ? 'immediately'
        : timing ===
            subscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
          ? 'at_end_of_current_billing_period'
          : 'auto'

    const adjustment =
      serverTiming === 'at_end_of_current_billing_period'
        ? {
            timing: serverTiming,
            newSubscriptionItems: [
              { priceSlug: priceIdOrSlug, quantity },
            ],
          }
        : {
            timing: serverTiming,
            newSubscriptionItems: [
              { priceSlug: priceIdOrSlug, quantity },
            ],
            prorateCurrentBillingPeriod: prorate ?? true,
          }

    return this.flowgladNode.post<FlowgladNode.Subscriptions.SubscriptionAdjustResponse>(
      `/api/v1/subscriptions/${subscriptionId}/adjust`,
      { body: { adjustment } }
    )
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
        usageDate: parsedParams.usageDate ?? undefined,
      },
    })
  }

  /**
   * Create multiple usage events in a single request.
   * NOTE: this method is more efficient than calling `createUsageEvent` multiple times.
   * @param params - The parameters containing an array of usage events.
   * @returns The created usage events.
   * @throws {Error} If any subscription in the bulk request is not owned by the authenticated customer.
   */
  public bulkCreateUsageEvents = async (
    params: BulkCreateUsageEventsParams
  ): Promise<{
    usageEvents: FlowgladNode.UsageEvents.UsageEventCreateResponse['usageEvent'][]
  }> => {
    const parsedParams = bulkCreateUsageEventsSchema.parse(params)

    // Get billing to access current subscriptions for validation
    const billing = await this.getBilling()

    // Extract unique subscription IDs from the bulk request
    const uniqueSubscriptionIds = [
      ...new Set(
        parsedParams.usageEvents.map((e) => e.subscriptionId)
      ),
    ]

    // Get the customer's current subscription IDs
    const customerSubscriptionIds =
      billing.currentSubscriptions?.map((sub) => sub.id) ?? []

    // Validate that all subscription IDs in the request are found among customer's current subscriptions
    for (const subscriptionId of uniqueSubscriptionIds) {
      if (!customerSubscriptionIds.includes(subscriptionId)) {
        throw new Error(
          `Subscription ${subscriptionId} is not found among the customer's current subscriptions`
        )
      }
    }

    // All validations passed, proceed with bulk creation
    const usageEvents = parsedParams.usageEvents.map(
      (usageEvent) => ({
        ...usageEvent,
        properties: usageEvent.properties ?? undefined,
        usageDate: usageEvent.usageDate ?? undefined,
      })
    )
    return this.flowgladNode.post('/api/v1/usage-events/bulk', {
      body: { usageEvents },
    })
  }

  public getPricingModel = async (): Promise<{
    pricingModel: FlowgladNode.PricingModels.PricingModelRetrieveResponse['pricingModel']
  }> => {
    const billing = await this.getBilling()
    return { pricingModel: billing.pricingModel }
  }
}
