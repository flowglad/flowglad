import {
  Flowglad as FlowgladNode,
  ClientOptions,
} from '@flowglad/node'

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

  public async getUsageEvent(id: string) {
    return this.flowgladNode.usageEvents.retrieve(id)
  }
}
