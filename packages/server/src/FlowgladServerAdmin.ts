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

  public async getCatalog(id: string) {
    return this.flowgladNode.catalogs.retrieve(id)
  }

  public async getDefaultCatalog() {
    return this.flowgladNode.catalogs.retrieveDefault()
  }

  public async createCatalog(
    input: FlowgladNode.Catalogs.CatalogCreateParams
  ) {
    return this.flowgladNode.catalogs.create(input)
  }

  public async updateCatalog(
    id: string,
    input: FlowgladNode.Catalogs.CatalogUpdateParams
  ) {
    return this.flowgladNode.catalogs.update(id, input)
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

  public async cloneCatalog(
    id: string,
    params: FlowgladNode.Catalogs.CatalogCloneParams
  ) {
    return this.flowgladNode.catalogs.clone(id, params)
  }
}
