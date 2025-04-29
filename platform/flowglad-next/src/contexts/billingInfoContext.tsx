'use client'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { createContext, useContext } from 'react'
import { Nullish, PriceType } from '@/types'
import {
  CheckoutInfoCore,
  checkoutInfoSchema,
} from '@/db/tableMethods/purchaseMethods'
import { BillingAddress } from '@/db/schema/organizations'

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
