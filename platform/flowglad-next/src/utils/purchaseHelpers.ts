import { PriceType, PurchaseStatus } from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import type { Price } from '@db-core/schema/prices'
import {
  type Purchase,
  purchasesInsertSchema,
} from '@db-core/schema/purchases'
import Papa from 'papaparse'
import core from './core'

/**
 * Returns a human-readable status label for a purchase based on its state.
 * - 'Concluded' if the purchase has ended
 * - 'Paid' if the purchase has been completed
 * - 'Pending' if the purchase is still in progress
 */
export const getPurchaseStatusLabel = (
  purchase: Purchase.ClientRecord
): string => {
  if (purchase.endDate) {
    return 'Concluded'
  }
  if (purchase.purchaseDate) {
    return 'Paid'
  }
  return 'Pending'
}

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
      priceType: price.type,
    } as const
  } else if (price?.type == PriceType.SinglePayment) {
    enhancements = {
      firstInvoiceValue: price.unitPrice,
      totalPurchaseValue: price.unitPrice,
      ...nulledSubsriptionFields,
      priceType: PriceType.SinglePayment,
    } as const
  } else if (price?.type == PriceType.Usage) {
    enhancements = {
      intervalUnit: price.intervalUnit,
      intervalCount: price.intervalCount,
      pricePerBillingCycle: price.unitPrice,
      trialPeriodDays: price.trialPeriodDays ?? 0,
      firstInvoiceValue: price.trialPeriodDays ? 0 : price.unitPrice,
      totalPurchaseValue: 0,
      priceType: PriceType.Usage,
    } as const
  }

  return enhancements
}

export const createManualPurchaseInsert = ({
  customer,
  price,
  organizationId,
}: {
  customer: Customer.Record
  price: Price.Record
  organizationId: string
}) => {
  const enhancements = projectPriceFieldsOntoPurchaseFields(price)
  const purchaseInsert = purchasesInsertSchema.parse({
    customerId: customer.id,
    priceId: price.id,
    organizationId,
    status: PurchaseStatus.Paid,
    name: `${price.name} - ${customer.name}`,
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

export const customerInsertsFromCSV = async (
  csvContent: string,
  organizationId: string,
  livemode: boolean,
  pricingModelId: string
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
      return {
        email: customer.email,
        name: customer.name ?? customer.email,
        organizationId: organizationId,
        externalId: core.nanoid(),
        livemode,
        pricingModelId,
      }
    }
  )

  return { customerInserts }
}
