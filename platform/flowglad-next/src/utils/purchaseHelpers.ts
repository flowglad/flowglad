import Papa from 'papaparse'
import {
  Purchase,
  purchasesInsertSchema,
} from '@/db/schema/purchases'
import { Price } from '@/db/schema/prices'
import { PriceType, PurchaseStatus } from '@/types'
import { CustomerProfile } from '@/db/schema/customerProfiles'
import {
  Customer,
  customersInsertSchema,
} from '@/db/schema/customers'
import core from './core'

export const projectPriceFieldsOntoPurchaseFields = (
  price: Price.Record
): Pick<
  Purchase.Insert,
  | 'intervalUnit'
  | 'intervalCount'
  | 'pricePerBillingCycle'
  | 'trialPeriodDays'
  | 'firstInvoiceValue'
  | 'totalPurchaseValue'
  | 'priceType'
> | null => {
  let enhancements: Pick<
    Purchase.Insert,
    | 'intervalUnit'
    | 'intervalCount'
    | 'pricePerBillingCycle'
    | 'trialPeriodDays'
    | 'firstInvoiceValue'
    | 'totalPurchaseValue'
    | 'priceType'
  > | null = null
  const nulledSubsriptionFields: Pick<
    Purchase.Insert,
    | 'intervalUnit'
    | 'intervalCount'
    | 'pricePerBillingCycle'
    | 'trialPeriodDays'
  > = {
    intervalUnit: null,
    intervalCount: null,
    pricePerBillingCycle: null,
    trialPeriodDays: null,
  }
  if (price?.type == PriceType.Subscription) {
    enhancements = {
      intervalUnit: price.intervalUnit,
      intervalCount: price.intervalCount,
      pricePerBillingCycle: price.unitPrice,
      trialPeriodDays: price.trialPeriodDays ?? 0,
      firstInvoiceValue: price.trialPeriodDays ? 0 : price.unitPrice,
      totalPurchaseValue: null,
      priceType: PriceType.Subscription,
    } as const
  } else if (price?.type == PriceType.SinglePayment) {
    enhancements = {
      firstInvoiceValue: price.unitPrice,
      totalPurchaseValue: price.unitPrice,
      ...nulledSubsriptionFields,
      priceType: PriceType.SinglePayment,
    } as const
  }

  return enhancements
}

export const createManualPurchaseInsert = ({
  customerProfile,
  price,
  organizationId,
}: {
  customerProfile: CustomerProfile.Record
  price: Price.Record
  organizationId: string
}) => {
  const enhancements = projectPriceFieldsOntoPurchaseFields(price)
  const purchaseInsert = purchasesInsertSchema.parse({
    customerProfileId: customerProfile.id,
    priceId: price.id,
    organizationId,
    status: PurchaseStatus.Paid,
    name: `${price.name} - ${customerProfile.name}`,
    priceType: price.type,
    quantity: 1,
    firstInvoiceValue: 0,
    totalPurchaseValue: 0,
    ...enhancements,
  })
  return purchaseInsert
}

interface CustomerCSVRow {
  name?: string
  email: string
  fullName?: string
  firstName?: string
  lastName?: string
  full_name?: string
  first_name?: string
  last_name?: string
}

export const customerAndCustomerProfileInsertsFromCSV = async (
  csvContent: string,
  organizationId: string,
  livemode: boolean
) => {
  // Parse CSV to JSON
  const results = await new Promise<CustomerCSVRow[]>((resolve) => {
    Papa.parse(csvContent, {
      header: true, // Treats first row as headers
      dynamicTyping: true, // Automatically converts numbers
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<CustomerCSVRow>) => {
        resolve(results.data as CustomerCSVRow[])
      },
    })
  })

  const customerInserts: Customer.Insert[] = results.map(
    (customer) => {
      let name = customer.name
      if (!name && customer.fullName) {
        name = customer.fullName
      }
      if (!name && customer.firstName && customer.lastName) {
        name = `${customer.firstName} ${customer.lastName}`
      }
      if (!name && customer.full_name) {
        name = customer.full_name
      }
      if (!name && customer.first_name && customer.last_name) {
        name = `${customer.first_name} ${customer.last_name}`
      }
      if (!name) {
        name = ''
      }
      return customersInsertSchema.parse({
        email: customer.email,
        name,
      })
    }
  )

  const customerProfileInserts: CustomerProfile.Insert[] =
    results.map((customer) => {
      return {
        email: customer.email,
        name: customer.name ?? customer.email,
        organizationId: organizationId,
        externalId: core.nanoid(),
        livemode,
      }
    })

  return { customerInserts, customerProfileInserts }
}
