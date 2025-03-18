import Papa from 'papaparse'
import {
  Purchase,
  purchasesInsertSchema,
} from '@/db/schema/purchases'
import { Price } from '@/db/schema/prices'
import { PriceType, PurchaseStatus } from '@/types'
import {
  BulkImportCustomerProfilesInput,
  CustomerProfile,
} from '@/db/schema/customerProfiles'
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
  variant,
  organizationId,
}: {
  customerProfile: CustomerProfile.Record
  variant: Price.Record
  organizationId: string
}) => {
  const enhancements = projectPriceFieldsOntoPurchaseFields(variant)
  const purchaseInsert = purchasesInsertSchema.parse({
    customerProfileId: customerProfile.id,
    priceId: variant.id,
    organizationId,
    status: PurchaseStatus.Paid,
    name: `${variant.name} - ${customerProfile.name}`,
    type: variant.type,
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

  const customerProfileInserts: Omit<
    CustomerProfile.Insert,
    'customerId'
  >[] = results.map((customer) => {
    return {
      email: customer.email,
      name: customer.name,
      organizationId: organizationId,
      externalId: core.nanoid(),
      livemode,
    }
  })

  return { customerInserts, customerProfileInserts }
}

export const customerAndCustomerProfileInsertsFromBulkImport = async (
  input: BulkImportCustomerProfilesInput,
  organizationId: string,
  livemode: boolean
) => {
  let customerUpserts: Customer.Insert[] = []
  let incompleteCustomerProfileUpserts: Omit<
    CustomerProfile.Insert,
    'customerId'
  >[] = []
  if (input.format === 'csv') {
    const csvContent = input.csvContent
    const result = await customerAndCustomerProfileInsertsFromCSV(
      csvContent,
      organizationId,
      livemode
    )
    customerUpserts = result.customerInserts
    incompleteCustomerProfileUpserts = result.customerProfileInserts
  }

  if (input.format === 'object') {
    customerUpserts = input.data.map((row) => {
      const customerUpsert = customersInsertSchema.safeParse({
        email: row.email,
        name: row.name,
      })
      if (!customerUpsert.success) {
        console.error(
          'Invalid customer data:',
          customerUpsert.error,
          'For row:',
          row
        )
        throw new Error('Invalid customer data')
      }
      return customerUpsert.data
    })
  }

  return { customerUpserts, incompleteCustomerProfileUpserts }
}
