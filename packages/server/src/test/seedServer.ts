import { createTestFlowgladServerAdmin } from './helpers'

export const setupProduct = async (params: {
  name: string
  description: string
  catalogId: string
  active?: boolean
}) => {
  const admin = createTestFlowgladServerAdmin()
  const product = await admin.createProduct({
    product: {
      name: params.name,
      description: params.description,
      active:
        typeof params.active === 'boolean' ? params.active : false,
      catalogId: params.catalogId,
      displayFeatures: [],
      imageURL: null,
      pluralQuantityLabel: 'items',
      singularQuantityLabel: 'item',
    },
    price: {
      unitPrice: 1000,
      intervalUnit: 'month',
      intervalCount: 1,
      active: true,
      isDefault: false,
      name: 'Test Product',
      setupFeeAmount: 0,
      type: 'subscription',
      usageMeterId: null,
      trialPeriodDays: null,
    },
  })
  return product
}
