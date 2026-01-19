import { Flowglad as FlowgladNode } from '@flowglad/node'
import {
  type AdjustSubscriptionParams,
  adjustSubscriptionParamsSchema,
  type BillingWithChecks,
  type BulkCreateUsageEventsParams,
  bulkCreateUsageEventsSchema,
  type CancelSubscriptionParams,
  type ClaimResourceParams,
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
  type ListResourceClaimsParams,
  type ReleaseResourceParams,
  type ResourceClaim,
  type ResourceIdentifier,
  type ResourceUsage,
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
      getProduct: constructGetProduct(rawBilling.pricingModel),
      getPrice: constructGetPrice(rawBilling.pricingModel),
      hasPurchased: constructHasPurchased(
        rawBilling.pricingModel,
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
   * // Simplest: adjust by price slug (quantity defaults to 1)
   * await flowglad.adjustSubscription({ priceSlug: 'pro-monthly' })
   *
   * // With quantity
   * await flowglad.adjustSubscription({ priceSlug: 'pro-monthly', quantity: 5 })
   *
   * // Using price ID
   * await flowglad.adjustSubscription({ priceId: 'price_abc123', quantity: 3 })
   *
   * // With timing override
   * await flowglad.adjustSubscription({
   *   priceSlug: 'pro-monthly',
   *   timing: 'at_end_of_current_billing_period'
   * })
   *
   * // Explicit subscription ID (for multi-subscription customers)
   * await flowglad.adjustSubscription({
   *   priceSlug: 'pro-monthly',
   *   subscriptionId: 'sub_123'
   * })
   *
   * // Complex adjustment with multiple items
   * await flowglad.adjustSubscription({
   *   subscriptionItems: [
   *     { priceSlug: 'base-plan', quantity: 1 },
   *     { priceSlug: 'addon-storage', quantity: 3 },
   *   ],
   *   timing: 'immediately',
   *   prorate: true,
   * })
   *
   * @param params - Adjustment parameters (one of three forms)
   * @param params.priceSlug - Adjust to a price by slug (mutually exclusive with priceId and subscriptionItems)
   * @param params.priceId - Adjust to a price by ID (mutually exclusive with priceSlug and subscriptionItems)
   * @param params.subscriptionItems - Array of items for multi-item adjustments (mutually exclusive with priceSlug and priceId)
   * @param params.quantity - Number of units for single-price adjustments (default: 1)
   * @param params.subscriptionId - Subscription ID (auto-resolves if customer has exactly 1 subscription)
   * @param params.timing - 'immediately' | 'at_end_of_current_billing_period' | 'auto' (default: 'auto')
   *   - 'auto': Upgrades happen immediately, downgrades at end of period
   *   - 'immediately': Apply change now with proration
   *   - 'at_end_of_current_billing_period': Apply change at next billing period
   * @param params.prorate - Whether to prorate (default: true for immediate, false for end-of-period)
   * @returns The adjusted subscription and its items
   * @throws {Error} If customer has no active subscriptions
   * @throws {Error} If customer has multiple subscriptions and subscriptionId not provided
   * @throws {Error} If the subscription is not owned by the authenticated customer
   */
  public adjustSubscription = async (
    params: AdjustSubscriptionParams
  ): Promise<FlowgladNode.Subscriptions.SubscriptionAdjustResponse> => {
    const parsedParams = adjustSubscriptionParamsSchema.parse(params)

    // Auto-resolve subscriptionId if not provided
    let subscriptionId = parsedParams.subscriptionId

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
          'Customer has multiple active subscriptions. Please specify subscriptionId in params.'
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

    // Timing values from SDK now match backend directly
    const timing =
      parsedParams.timing ?? subscriptionAdjustmentTiming.Auto
    const prorate = parsedParams.prorate

    // Build newSubscriptionItems based on the params form
    let newSubscriptionItems: Array<{
      priceId?: string
      priceSlug?: string
      quantity: number
    }>

    if (
      'subscriptionItems' in parsedParams &&
      parsedParams.subscriptionItems
    ) {
      // Multi-item adjustment
      newSubscriptionItems = parsedParams.subscriptionItems.map(
        (item) => ({
          ...item,
          quantity: item.quantity ?? 1,
        })
      )
    } else if (
      'priceSlug' in parsedParams &&
      parsedParams.priceSlug
    ) {
      // Single price by slug
      newSubscriptionItems = [
        {
          priceSlug: parsedParams.priceSlug,
          quantity: parsedParams.quantity ?? 1,
        },
      ]
    } else if ('priceId' in parsedParams && parsedParams.priceId) {
      // Single price by ID
      newSubscriptionItems = [
        {
          priceId: parsedParams.priceId,
          quantity: parsedParams.quantity ?? 1,
        },
      ]
    } else {
      throw new Error(
        'Invalid params: must provide priceSlug, priceId, or subscriptionItems'
      )
    }

    const adjustment =
      timing ===
      subscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
        ? {
            timing,
            newSubscriptionItems,
          }
        : {
            timing,
            newSubscriptionItems,
            prorateCurrentBillingPeriod: prorate ?? true,
          }

    return this.flowgladNode.subscriptions.adjust(subscriptionId, {
      adjustment,
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

  private deriveSubscriptionId = async (
    maybeSubscriptionId?: string
  ): Promise<string> => {
    if (maybeSubscriptionId) {
      return maybeSubscriptionId
    }
    const billing = await this.getBilling()
    const currentSubscriptions = billing.currentSubscriptions ?? []
    if (currentSubscriptions.length === 0) {
      throw new Error(
        'No active subscription found for this customer'
      )
    }
    if (currentSubscriptions.length > 1) {
      throw new Error(
        'Customer has multiple active subscriptions. Please specify subscriptionId.'
      )
    }
    return currentSubscriptions[0].id
  }
  /**
   * Get all resources and their usage for the customer's subscription.
   *
   * Returns capacity, claimed count, and available count for all resources
   * in the subscription's pricing model.
   *
   * @param params - Optional parameters for fetching resources
   * @param params.subscriptionId - Optional. Auto-resolved if customer has exactly one active subscription.
   *
   * @returns A promise that resolves to an object containing an array of resources with usage data
   *
   * @throws {Error} If the customer is not authenticated
   * @throws {Error} If no active subscription is found for the customer
   * @throws {Error} If the customer has multiple active subscriptions and no subscriptionId is provided
   * @throws {Error} If the specified subscription is not owned by the authenticated customer
   *
   * @example
   * // Get all resources for the customer's subscription
   * const { resources } = await flowglad.getResourceUsages()
   * for (const resource of resources) {
   *   console.log(`${resource.resourceSlug}: ${resource.claimed}/${resource.capacity} used`)
   * }
   *
   * @example
   * // Get resources for a specific subscription
   * const { resources } = await flowglad.getResourceUsages({ subscriptionId: 'sub_123' })
   */
  public getResourceUsages = async (
    params?: FlowgladNode.ResourceClaims.ResourceClaimListUsagesParams & {
      subscriptionId?: string
    }
  ): Promise<{ resources: ResourceUsage[] }> => {
    // Auto-resolve subscriptionId if not provided
    const subscriptionId = await this.deriveSubscriptionId(
      params?.subscriptionId
    )
    // Validate ownership
    const { subscription } =
      await this.flowgladNode.subscriptions.retrieve(subscriptionId)
    const { customer } = await this.getCustomer()
    if (subscription.customerId !== customer.id) {
      throw new Error('Subscription is not owned by the current user')
    }

    // The Node SDK doesn't always expose a stable listUsages helper, so we call the API directly.
    const usages = (await this.flowgladNode.get(
      `/api/v1/resource-claims/${subscriptionId}/usages`
    )) as Array<{ usage: ResourceUsage; claims: unknown[] }>

    return {
      resources: usages.map((entry) => entry.usage),
    }
  }

  /**
   * Get usage for a single resource for the customer's subscription.
   *
   * Returns capacity, claimed count, available count, and active claims
   * for a specific resource identified by slug or ID.
   *
   * @param params - Parameters for fetching resource usage
   * @param params.resourceSlug - The slug identifying the resource type (e.g., 'seats', 'api_keys')
   * @param params.resourceId - Alternative to resourceSlug: The ID of the resource
   * @param params.subscriptionId - Optional. Auto-resolved if customer has exactly one active subscription.
   *
   * @returns A promise that resolves to an object containing usage data and active claims
   *
   * @throws {Error} If the customer is not authenticated
   * @throws {Error} If no active subscription is found for the customer
   * @throws {Error} If the customer has multiple active subscriptions and no subscriptionId is provided
   * @throws {Error} If the specified subscription is not owned by the authenticated customer
   *
   * @example
   * // Get usage for seats resource by slug
   * const { usage, claims } = await flowglad.getResourceUsage({ resourceSlug: 'seats' })
   * console.log(`${usage.claimed}/${usage.capacity} seats used`)
   *
   * @example
   * // Get usage for a specific subscription
   * const { usage, claims } = await flowglad.getResourceUsage({
   *   resourceSlug: 'seats',
   *   subscriptionId: 'sub_123'
   * })
   */
  public getResourceUsage = async (
    params: ResourceIdentifier & { subscriptionId?: string }
  ): Promise<FlowgladNode.ResourceClaims.ResourceClaimRetrieveUsageResponse> => {
    const subscriptionId = await this.deriveSubscriptionId(
      params?.subscriptionId
    )
    // Validate ownership
    const { subscription } =
      await this.flowgladNode.subscriptions.retrieve(subscriptionId)
    const { customer } = await this.getCustomer()
    if (subscription.customerId !== customer.id) {
      throw new Error('Subscription is not owned by the current user')
    }
    return await this.flowgladNode.resourceClaims.retrieveUsage(
      subscriptionId,
      params
    )
  }
  /**
   * Claim resources from a subscription's capacity.
   *
   * Resources represent claimable capacity like seats, API keys, or other
   * countable entitlements. This method reserves capacity from the subscription's
   * available pool.
   *
   * ## Modes
   *
   * Choose ONE of the following modes per call:
   *
   * ### Anonymous Claims Mode
   * Use `quantity` to claim N anonymous resources. These are interchangeable
   * and released in FIFO order when releasing by quantity.
   *
   * ### Named Claims Mode
   * Use `externalId` or `externalIds` to claim resources with identifiers.
   * These are idempotent - claiming the same externalId twice returns the
   * existing claim without creating a duplicate.
   *
   * @param params - Parameters for claiming resources
   * @param params.resourceSlug - The slug identifying the resource type (e.g., 'seats', 'api_keys')
   * @param params.subscriptionId - Optional. Auto-resolved if customer has exactly one active subscription.
   * @param params.quantity - Anonymous mode: Number of anonymous resources to claim
   * @param params.externalId - Named mode: Single identifier for a named resource
   * @param params.externalIds - Named mode: Array of identifiers for multiple named resources
   * @param params.metadata - Optional key-value data to attach to claims
   *
   * @returns A promise that resolves to an object containing the created claims and updated usage
   *
   * @throws {Error} If the customer is not authenticated
   * @throws {Error} If no active subscription is found for the customer
   * @throws {Error} If the customer has multiple active subscriptions and no subscriptionId is provided
   * @throws {Error} If the specified subscription is not owned by the authenticated customer
   * @throws {Error} If insufficient capacity is available to fulfill the claim
   *
   * @example
   * // Claim 3 anonymous seats (anonymous mode)
   * const result = await flowglad.claimResource({
   *   resourceSlug: 'seats',
   *   quantity: 3
   * })
   *
   * @example
   * // Claim a specific seat for a user (named mode, idempotent)
   * const result = await flowglad.claimResource({
   *   resourceSlug: 'seats',
   *   externalId: 'user_123',
   *   metadata: { assignedTo: 'John Doe' }
   * })
   *
   * @example
   * // Claim multiple named seats at once
   * const result = await flowglad.claimResource({
   *   resourceSlug: 'seats',
   *   externalIds: ['user_123', 'user_456', 'user_789']
   * })
   */
  public claimResource = async (
    params: ClaimResourceParams
  ): Promise<FlowgladNode.ResourceClaimClaimResponse> => {
    // Auto-resolve subscriptionId if not provided
    let subscriptionId = params.subscriptionId
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
          'Customer has multiple active subscriptions. Please specify subscriptionId.'
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

    return this.flowgladNode.resourceClaims.claim(subscriptionId, {
      resourceSlug: params.resourceSlug,
      metadata: params.metadata,
      quantity: params.quantity,
      externalId: params.externalId,
      externalIds: params.externalIds,
    })
  }

  /**
   * Release claimed resources back to the subscription's available pool.
   *
   * ## Modes
   *
   * Choose ONE of the following modes per call:
   *
   * ### Anonymous Mode
   * Use `quantity` to release N anonymous claims in FIFO order (oldest first).
   *
   * ### Named Mode by External ID
   * Use `externalId` or `externalIds` to release specific named claims.
   *
   * ### Direct Mode
   * Use `claimIds` to release specific claims by their database IDs.
   *
   * @param params - Parameters for releasing resources
   * @param params.resourceSlug - The slug identifying the resource type
   * @param params.subscriptionId - Optional. Auto-resolved if customer has exactly one active subscription.
   * @param params.quantity - Anonymous mode: Number of anonymous claims to release (FIFO)
   * @param params.externalId - Named mode: Single identifier to release
   * @param params.externalIds - Named mode: Array of identifiers to release
   * @param params.claimIds - Direct mode: Array of claim IDs to release
   *
   * @returns A promise that resolves to an object containing the released claims and updated usage
   *
   * @throws {Error} If the customer is not authenticated
   * @throws {Error} If no active subscription is found for the customer
   * @throws {Error} If the customer has multiple active subscriptions and no subscriptionId is provided
   * @throws {Error} If the specified subscription is not owned by the authenticated customer
   *
   * @example
   * // Release 2 anonymous seats (anonymous mode, FIFO)
   * const result = await flowglad.releaseResource({
   *   resourceSlug: 'seats',
   *   quantity: 2
   * })
   *
   * @example
   * // Release a specific user's seat (named mode)
   * const result = await flowglad.releaseResource({
   *   resourceSlug: 'seats',
   *   externalId: 'user_123'
   * })
   *
   * @example
   * // Release multiple users' seats at once
   * const result = await flowglad.releaseResource({
   *   resourceSlug: 'seats',
   *   externalIds: ['user_123', 'user_456']
   * })
   *
   * @example
   * // Release specific claims by their IDs
   * const result = await flowglad.releaseResource({
   *   resourceSlug: 'seats',
   *   claimIds: ['claim_abc', 'claim_def']
   * })
   */
  public releaseResource = async (
    params: ReleaseResourceParams
  ): Promise<FlowgladNode.ResourceClaimReleaseResponse> => {
    // Auto-resolve subscriptionId if not provided
    let subscriptionId = params.subscriptionId
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
          'Customer has multiple active subscriptions. Please specify subscriptionId.'
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

    return this.flowgladNode.resourceClaims.release(subscriptionId, {
      resourceSlug: params.resourceSlug,
      quantity: params.quantity,
      externalId: params.externalId,
      externalIds: params.externalIds,
      claimIds: params.claimIds,
    })
  }

  /**
   * List active resource claims for a subscription.
   *
   * Returns all active (unreleased) claims for the customer's subscription.
   * Can optionally filter by resource type using the resourceSlug parameter.
   *
   * @param params - Optional parameters for listing claims
   * @param params.subscriptionId - Optional. Auto-resolved if customer has exactly one active subscription.
   * @param params.resourceSlug - Optional. Filter to specific resource type.
   *
   * @returns A promise that resolves to an object containing an array of active claims
   *
   * @throws {Error} If the customer is not authenticated
   * @throws {Error} If no active subscription is found for the customer
   * @throws {Error} If the customer has multiple active subscriptions and no subscriptionId is provided
   * @throws {Error} If the specified subscription is not owned by the authenticated customer
   *
   * @example
   * // List all active claims for the subscription
   * const { claims } = await flowglad.listResourceClaims()
   * console.log(`Total active claims: ${claims.length}`)
   *
   * @example
   * // List only seat claims
   * const { claims } = await flowglad.listResourceClaims({ resourceSlug: 'seats' })
   * const namedSeats = claims.filter(c => c.externalId !== null)
   * console.log(`Named seats: ${namedSeats.length}`)
   *
   * @example
   * // List claims for a specific subscription
   * const { claims } = await flowglad.listResourceClaims({
   *   subscriptionId: 'sub_123',
   *   resourceSlug: 'api_keys'
   * })
   */
  public listResourceClaims = async (
    params?: ListResourceClaimsParams
  ): Promise<{ claims: ResourceClaim[] }> => {
    // Auto-resolve subscriptionId if not provided
    let subscriptionId = params?.subscriptionId
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
          'Customer has multiple active subscriptions. Please specify subscriptionId.'
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

    return this.flowgladNode.get(
      `/api/v1/resource-claims/${subscriptionId}/claims`,
      {
        query: params?.resourceSlug
          ? { resourceSlug: params.resourceSlug }
          : undefined,
      }
    )
  }
}
