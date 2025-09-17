'use client'

import { PriceType } from '@/types'

// Returns UI-ready flags for price form behavior based on price type and default locks
// - omitTrialFields: hide trial UI for usage prices
// - disableAmountAndTrials: lock amount and trials when default product + default price
// - isDefaultLocked: convenience flag (default product AND default price)
export function usePriceConstraints(params: {
  type: PriceType | undefined
  isDefaultProduct: boolean
  isDefaultPrice: boolean
}) {
  const { type, isDefaultProduct, isDefaultPrice } = params

  const isDefaultLocked = isDefaultProduct && isDefaultPrice
  const omitTrialFields = type === PriceType.Usage
  const disableAmountAndTrials = isDefaultLocked

  return { omitTrialFields, disableAmountAndTrials, isDefaultLocked }
}
