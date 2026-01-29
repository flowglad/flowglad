'use client'
import { PriceType } from '@db-core/enums'
import { createContext, useContext } from 'react'
import type {
  BillingAddress,
  Organization,
} from '@/db/schema/organizations'
import type { Product } from '@/db/schema/products'
import {
  type CheckoutInfoCore,
  checkoutInfoSchema,
} from '@/db/tableMethods/purchaseMethods'
import { type Nullish } from '@/types'

export type CheckoutInfoContextValues = {
  taxAmount?: Nullish<number>
  sellerOrganization?: Pick<Organization.Record, 'logoURL' | 'name'>
  product?: Product.ClientRecord
  type: PriceType
  billingAddress?: Nullish<BillingAddress>
} & CheckoutInfoCore

const CheckoutInfoContext = createContext<
  Partial<CheckoutInfoContextValues>
>({
  type: PriceType.SinglePayment,
  billingAddress: null,
})

export const useSafeCheckoutInfoContext = () => {
  const checkoutInfo = useContext(CheckoutInfoContext)
  return checkoutInfoSchema.parse(checkoutInfo)
}

const CheckoutInfoProvider = ({
  children,
  values,
}: {
  children: React.ReactNode
  values: CheckoutInfoContextValues
}) => {
  return (
    <CheckoutInfoContext.Provider value={values}>
      {children}
    </CheckoutInfoContext.Provider>
  )
}

export default CheckoutInfoProvider
