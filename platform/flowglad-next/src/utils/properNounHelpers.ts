import type { Customer } from '@/db/schema/customers'
import type { Discount } from '@/db/schema/discounts'
import type { File } from '@/db/schema/files'
import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import type { ProperNoun } from '@/db/schema/properNouns'
import {
  Nouns,
  type SupabaseInsertPayload,
  type SupabaseUpdatePayload,
} from '@/types'

interface CreateProperNounUpsertParams<T> {
  record: T
  organizationId: string
}

export const databaseTablesForNoun: Record<Nouns, string> = {
  [Nouns.Product]: 'Products',
  [Nouns.Price]: 'Prices',
  [Nouns.Customer]: 'Customers',
  [Nouns.Discount]: 'Discounts',
  [Nouns.File]: 'Files',
}

export const productRecordToProperNounUpsert = (
  params: CreateProperNounUpsertParams<Product.Record>
): ProperNoun.Insert => {
  return {
    entityId: params.record.id,
    entityType: Nouns.Product,
    name: params.record.name,
    organizationId: params.organizationId,
    livemode: params.record.livemode,
  }
}

export const variantRecordToProperNounUpsert = (
  params: CreateProperNounUpsertParams<Price.Record>
): ProperNoun.Insert => {
  return {
    entityId: params.record.id,
    entityType: Nouns.Price,
    name: params.record.name ?? '',
    organizationId: params.organizationId,
    livemode: params.record.livemode,
  }
}

export const discountRecordToProperNounUpsert = (
  params: CreateProperNounUpsertParams<Discount.Record>
): ProperNoun.Insert => {
  return {
    entityId: params.record.id,
    entityType: Nouns.Discount,
    name: params.record.name,
    organizationId: params.organizationId,
    livemode: params.record.livemode,
  }
}

export const fileRecordToProperNounUpsert = (
  params: CreateProperNounUpsertParams<File.Record>
): ProperNoun.Insert => {
  return {
    entityId: params.record.id,
    entityType: Nouns.File,
    name: params.record.name,
    organizationId: params.organizationId,
    livemode: params.record.livemode,
  }
}

export const customerToProperNounUpsert = (
  params: CreateProperNounUpsertParams<Customer.Record>
): ProperNoun.Insert => {
  return {
    entityId: params.record.id,
    entityType: Nouns.Customer,
    name: params.record.name ?? params.record.email,
    organizationId: params.organizationId,
    livemode: params.record.livemode,
  }
}

export const supabasePayloadToProperNounUpsert = async (
  payload: SupabaseInsertPayload | SupabaseUpdatePayload,
  organizationId: string
): Promise<ProperNoun.Insert> => {
  let properNounUpsert: ProperNoun.Insert | null = null

  switch (payload.table) {
    case 'Customers':
      properNounUpsert = customerToProperNounUpsert({
        record: payload.record as Customer.Record,
        organizationId: (payload.record as Customer.Record)
          .organizationId,
      })
      break
    case 'Products':
      properNounUpsert = productRecordToProperNounUpsert({
        record: payload.record as Product.Record,
        organizationId: (payload.record as Product.Record)
          .organizationId,
      })
      break
    case 'Prices':
      properNounUpsert = variantRecordToProperNounUpsert({
        record: payload.record as Price.Record,
        organizationId,
      })
      break
    default:
      throw new Error('Invalid table')
  }

  if (!properNounUpsert) {
    throw new Error('Invalid table')
  }

  return properNounUpsert
}
