import { Product } from '@/db/schema/products'

export const dummyProduct: Product.Record = {
  id: '1',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  name: 'Test Product',
  description: 'Test Product Description',
  imageURL: null,
  organizationId: '1',
  displayFeatures: null,
  active: true,
  livemode: false,
  singularQuantityLabel: null,
  pluralQuantityLabel: null,
  pricingModelId: 'pricingModel_111____',
  externalId: null,
  createdByCommit: 'test',
  updatedByCommit: 'test',
  position: 0,
  default: false,
  slug: 'test-product',
}
