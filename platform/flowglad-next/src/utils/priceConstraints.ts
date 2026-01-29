import { PriceType } from '@db-core/enums'

// Returns UI-ready flags for price form behavior based on price type and default locks
// - omitTrialFields: hide trial UI for usage prices
// - defaultPriceLocked: lock amount and trials when default product + default price
// - isDefaultLocked: convenience flag (default product AND default price)
export function getPriceConstraints(params: {
  type: PriceType | undefined
  isDefaultProduct: boolean
  isDefaultPrice: boolean
}) {
  const { type, isDefaultProduct, isDefaultPrice } = params

  const isDefaultLocked = isDefaultProduct && isDefaultPrice
  const omitTrialFields = type === PriceType.Usage
  const defaultPriceLocked = isDefaultLocked

  return { omitTrialFields, defaultPriceLocked, isDefaultLocked }
}
