import { createTestFlowgladServerAdmin } from './helpers'

export const setupProduct = async (params: {
  name: string
  description: string
  pricingModelId: string
  active?: boolean
}) => {
  const admin = createTestFlowgladServerAdmin()
  const { pricingModel } = await admin.getDefaultPricingModel()
  const { product } = await admin.createProduct({
    product: {
      name: params.name,
      description: params.description,
      active:
        typeof params.active === 'boolean' ? params.active : false,
      pricingModelId: pricingModel.id,
      imageURL: null,
      pluralQuantityLabel: 'items',
      singularQuantityLabel: 'item',
      slug: 'test-product',
      default: false,
    },
    price: {
      unitPrice: 1000,
      intervalUnit: 'month',
      intervalCount: 1,
      active: true,
      isDefault: false,
      name: 'Test Product',
      type: 'subscription',
      slug: 'test-product',
      trialPeriodDays: null,
      usageEventsPerUnit: null,
      usageMeterId: null,
    },
  })
  return { product, pricingModel }
}
