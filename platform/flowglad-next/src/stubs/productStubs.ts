import { Product } from '@/db/schema/products'

export const dummyProduct: Product.Record = {
  id: '1',
  createdAt: new Date(),
  updatedAt: new Date(),
  name: 'Test Product',
  description: 'Test Product Description',
  imageURL: null,
  organizationId: '1',
  displayFeatures: null,
  active: true,
  livemode: false,
  singularQuantityLabel: null,
  pluralQuantityLabel: null,
  catalogId: 'catalog_111____',
  externalId: null,
  createdByCommit: 'test',
  updatedByCommit: 'test',
  position: 0,
  default: false,
}
