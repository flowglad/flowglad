'use client'

import { useMemo } from 'react'
import { PriceType } from '@/types'

export type PriceConstraints = {
  omitTrialFields: boolean
  disableAmountAndTrials: boolean
}

export function usePriceConstraints(params: {
  type: PriceType | undefined
  isDefaultProduct: boolean
  isDefaultPrice: boolean
}) {
  const { type, isDefaultProduct, isDefaultPrice } = params

  const isDefaultLocked = isDefaultProduct && isDefaultPrice

  const constraints: PriceConstraints = useMemo(
    () => ({
      omitTrialFields: type === PriceType.Usage,
      disableAmountAndTrials: isDefaultLocked,
    }),
    [type, isDefaultLocked]
  )

  return { constraints, isDefaultLocked }
}


