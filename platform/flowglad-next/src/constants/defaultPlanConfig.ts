import { PriceType, IntervalUnit } from '@/types'

export const createDefaultProductConfig = () => ({
  name: 'Free Plan',
  slug: 'free',
  default: true,
})

export const createDefaultPriceConfig = () => ({
  name: 'Free Plan',
  slug: 'free',
  unitPrice: 0,
  isDefault: true,
  type: PriceType.Subscription,
  intervalCount: 1,
  intervalUnit: IntervalUnit.Month,
})

export const createDefaultPlanConfig = () => ({
  product: createDefaultProductConfig(),
  price: createDefaultPriceConfig(),
})
