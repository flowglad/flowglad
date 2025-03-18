import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { Discount } from '@/db/schema/discounts'
import { File } from '@/db/schema/files'
import { ProperNoun } from '@/db/schema/properNouns'
import { CustomerProfile } from '@/db/schema/customerProfiles'
import {
  Nouns,
  SupabaseInsertPayload,
  SupabaseUpdatePayload,
} from '@/types'

interface CreateProperNounUpsertParams<T> {
  record: T
  organizationId: string
}

export const databaseTablesForNoun: Record<Nouns, string> = {
  [Nouns.Product]: 'Products',
  [Nouns.Price]: 'Prices',
  [Nouns.CustomerProfile]: 'CustomerProfiles',
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

export const customerProfileToProperNounUpsert = (
  params: CreateProperNounUpsertParams<CustomerProfile.Record>
): ProperNoun.Insert => {
  return {
    entityId: params.record.id,
    entityType: Nouns.CustomerProfile,
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
    case 'CustomerProfiles':
      properNounUpsert = customerProfileToProperNounUpsert({
        record: payload.record as CustomerProfile.Record,
        organizationId: (payload.record as CustomerProfile.Record)
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
