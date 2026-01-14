import {
  type ClientOptions,
  Flowglad as FlowgladNode,
} from '@flowglad/node'
import {
  type BulkCreateUsageEventsParams,
  bulkCreateUsageEventsSchema,
  type ClaimResourceParams,
  type ReleaseResourceParams,
  type ResourceClaim,
  type ResourceUsage,
} from '@flowglad/shared'

export class FlowgladServerAdmin {
  private flowgladNode: FlowgladNode

  constructor(options: ClientOptions) {
    this.flowgladNode = new FlowgladNode(options)
  }

  public async createCustomer(
    input: FlowgladNode.Customers.CustomerCreateParams
  ) {
    return this.flowgladNode.customers.create(input)
  }

  public async getCustomer(externalId: string) {
    return this.flowgladNode.customers.retrieve(externalId)
  }

  public async getCustomerBilling(externalId: string) {
    return this.flowgladNode.customers.retrieveBilling(externalId)
  }

  public async updateCustomer(
    id: string,
    input: FlowgladNode.Customers.CustomerUpdateParams
  ) {
    return this.flowgladNode.customers.update(id, input)
  }

  public async getPricingModel(id: string) {
    return this.flowgladNode.pricingModels.retrieve(id)
  }

  public async getDefaultPricingModel() {
    return this.flowgladNode.pricingModels.retrieveDefault()
  }

  public async createProduct(
    input: FlowgladNode.Products.ProductCreateParams
  ) {
    return this.flowgladNode.products.create(input)
  }

  public async updateProduct(
    id: string,
    input: FlowgladNode.Products.ProductUpdateParams
  ) {
    return this.flowgladNode.products.update(id, input)
  }

  public async clonePricingModel(
    id: string,
    params: FlowgladNode.PricingModels.PricingModelCloneParams
  ) {
    return this.flowgladNode.pricingModels.clone(id, params)
  }

  public async getUsageMeter(id: string) {
    return this.flowgladNode.usageMeters.retrieve(id)
  }
  public async updateUsageMeter(
    id: string,
    params: FlowgladNode.UsageMeters.UsageMeterUpdateParams
  ) {
    return this.flowgladNode.usageMeters.update(id, params)
  }

  public async createUsageMeter(
    params: FlowgladNode.UsageMeters.UsageMeterCreateParams
  ) {
    return this.flowgladNode.usageMeters.create(params)
  }

  public async createUsageEvent(
    params: FlowgladNode.UsageEvents.UsageEventCreateParams
  ) {
    return this.flowgladNode.usageEvents.create(params)
  }

  /**
   * Create multiple usage events in a single request.
   * NOTE: this method is more efficient than calling `createUsageEvent` multiple times.
   * @param params - The parameters containing an array of usage events.
   * @returns The created usage events.
   */
  public async bulkCreateUsageEvents(
    params: BulkCreateUsageEventsParams
  ): Promise<{
    usageEvents: FlowgladNode.UsageEvents.UsageEventCreateResponse['usageEvent'][]
  }> {
    const parsedParams = bulkCreateUsageEventsSchema.parse(params)
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

  public async getUsageEvent(id: string) {
    return this.flowgladNode.usageEvents.retrieve(id)
  }

  /**
   * Get all resources and their usage for a subscription (admin operation).
   *
   * Returns capacity, claimed count, and available count for all resources
   * in the subscription's pricing model. This operation bypasses customer
   * authentication and ownership validation.
   *
   * @param subscriptionId - The subscription ID to get resources for (required)
   * @returns Promise containing an array of resources with their usage data
   *
   * @example
   * // Get all resources for a subscription
   * const { resources } = await flowgladAdmin.getResources('sub_123')
   * for (const resource of resources) {
   *   console.log(`${resource.resourceSlug}: ${resource.claimed}/${resource.capacity} claimed`)
   * }
   *
   * @example
   * // Check if a subscription has available capacity for a specific resource
   * const { resources } = await flowgladAdmin.getResources('sub_abc')
   * const seats = resources.find(r => r.resourceSlug === 'seats')
   * if (seats && seats.available > 0) {
   *   console.log(`${seats.available} seats available`)
   * }
   */
  public async getResources(
    subscriptionId: string
  ): Promise<{ resources: ResourceUsage[] }> {
    const result =
      await this.flowgladNode.resourceClaims.usage(subscriptionId)
    return { resources: result.usage }
  }

  /**
   * Claim resources on behalf of a customer (admin operation).
   *
   * This operation bypasses customer authentication and ownership validation,
   * allowing merchants to claim resources for any subscription they manage.
   *
   * ## Claim Modes
   *
   * Choose ONE of the following modes per call:
   *
   * ### Anonymous Claims
   * Use `quantity` to claim N resources without external identifiers.
   * These claims are interchangeable and released in FIFO order when
   * using quantity-based release.
   *
   * ### Named Claims
   * Use `externalId` or `externalIds` to claim resources with identifiers.
   * Named claims are idempotent - claiming the same externalId twice
   * returns the existing claim without creating a duplicate.
   *
   * @param subscriptionId - The subscription ID to claim resources from (required)
   * @param params - Claim parameters (resourceSlug and exactly one of quantity/externalId/externalIds)
   * @param params.resourceSlug - The slug identifying the resource type (e.g., 'seats', 'api_keys')
   * @param params.quantity - Anonymous mode: Number of resources to claim
   * @param params.externalId - Named mode: Single identifier for a named resource
   * @param params.externalIds - Named mode: Array of identifiers for multiple named resources
   * @param params.metadata - Optional key-value data to attach to claims
   * @returns Promise containing the created claims and updated usage
   *
   * @example
   * // Claim 5 anonymous seats for a subscription
   * const { claims, usage } = await flowgladAdmin.claimResource('sub_123', {
   *   resourceSlug: 'seats',
   *   quantity: 5
   * })
   * console.log(`Created ${claims.length} claims, ${usage.available} seats remaining`)
   *
   * @example
   * // Claim named seats for specific users (idempotent)
   * const { claims } = await flowgladAdmin.claimResource('sub_123', {
   *   resourceSlug: 'seats',
   *   externalIds: ['user_alice', 'user_bob', 'user_charlie'],
   *   metadata: { assignedBy: 'admin' }
   * })
   *
   * @example
   * // Claim a single named API key
   * const { claims } = await flowgladAdmin.claimResource('sub_456', {
   *   resourceSlug: 'api_keys',
   *   externalId: 'production-key',
   *   metadata: { environment: 'production' }
   * })
   */
  public async claimResource(
    subscriptionId: string,
    params: Omit<ClaimResourceParams, 'subscriptionId'>
  ): Promise<{ claims: ResourceClaim[]; usage: ResourceUsage }> {
    const result = await this.flowgladNode.resourceClaims.claim(
      subscriptionId,
      params
    )
    return {
      claims: result.claims as ResourceClaim[],
      usage: result.usage,
    }
  }

  /**
   * Release claimed resources on behalf of a customer (admin operation).
   *
   * This operation bypasses customer authentication and ownership validation,
   * allowing merchants to release resources for any subscription they manage.
   *
   * ## Release Modes
   *
   * Choose ONE of the following modes per call:
   *
   * ### Anonymous Mode (FIFO)
   * Use `quantity` to release N anonymous claims in FIFO order (oldest first).
   * Only releases claims that have no external identifier.
   *
   * ### Named Mode by External ID
   * Use `externalId` or `externalIds` to release specific named claims
   * by their external identifiers.
   *
   * ### Direct Mode
   * Use `claimIds` to release specific claims by their database IDs.
   * Works for both anonymous and named claims.
   *
   * @param subscriptionId - The subscription ID to release resources from (required)
   * @param params - Release parameters (resourceSlug and exactly one of quantity/externalId/externalIds/claimIds)
   * @param params.resourceSlug - The slug identifying the resource type
   * @param params.quantity - Anonymous mode: Number of claims to release (FIFO)
   * @param params.externalId - Named mode: Single identifier to release
   * @param params.externalIds - Named mode: Array of identifiers to release
   * @param params.claimIds - Direct mode: Array of claim IDs to release
   * @returns Promise containing the released claims and updated usage
   *
   * @example
   * // Release 3 anonymous seats (FIFO order)
   * const { releasedClaims, usage } = await flowgladAdmin.releaseResource('sub_123', {
   *   resourceSlug: 'seats',
   *   quantity: 3
   * })
   * console.log(`Released ${releasedClaims.length} claims, ${usage.available} seats now available`)
   *
   * @example
   * // Release a specific user's seat
   * const { releasedClaims } = await flowgladAdmin.releaseResource('sub_123', {
   *   resourceSlug: 'seats',
   *   externalId: 'user_alice'
   * })
   *
   * @example
   * // Release multiple named API keys
   * const { releasedClaims } = await flowgladAdmin.releaseResource('sub_456', {
   *   resourceSlug: 'api_keys',
   *   externalIds: ['staging-key', 'dev-key']
   * })
   *
   * @example
   * // Release specific claims by their IDs
   * const { releasedClaims } = await flowgladAdmin.releaseResource('sub_789', {
   *   resourceSlug: 'seats',
   *   claimIds: ['claim_abc', 'claim_def']
   * })
   */
  public async releaseResource(
    subscriptionId: string,
    params: Omit<ReleaseResourceParams, 'subscriptionId'>
  ): Promise<{
    releasedClaims: ResourceClaim[]
    usage: ResourceUsage
  }> {
    const result = await this.flowgladNode.resourceClaims.release(
      subscriptionId,
      params
    )
    return {
      releasedClaims: result.releasedClaims as ResourceClaim[],
      usage: result.usage,
    }
  }

  /**
   * List active resource claims for a subscription (admin operation).
   *
   * This operation bypasses customer authentication and ownership validation,
   * allowing merchants to view claims for any subscription they manage.
   *
   * @param subscriptionId - The subscription ID to list claims for (required)
   * @param resourceSlug - Optional filter to return only claims for a specific resource type
   * @returns Promise containing an array of active claims
   *
   * @example
   * // List all active claims for a subscription
   * const { claims } = await flowgladAdmin.listResourceClaims('sub_123')
   * console.log(`Found ${claims.length} active claims`)
   *
   * @example
   * // List only seat claims
   * const { claims } = await flowgladAdmin.listResourceClaims('sub_123', 'seats')
   * const namedSeats = claims.filter(c => c.externalId !== null)
   * console.log(`${namedSeats.length} named seats assigned`)
   *
   * @example
   * // Find claims for a specific user across a subscription
   * const { claims } = await flowgladAdmin.listResourceClaims('sub_123')
   * const userClaims = claims.filter(c => c.externalId === 'user_alice')
   */
  public async listResourceClaims(
    subscriptionId: string,
    resourceSlug?: string
  ): Promise<{ claims: ResourceClaim[] }> {
    const query = resourceSlug ? { resourceSlug } : undefined
    return this.flowgladNode.get<{ claims: ResourceClaim[] }>(
      `/api/v1/resource-claims/${subscriptionId}/claims`,
      { query }
    )
  }
}
