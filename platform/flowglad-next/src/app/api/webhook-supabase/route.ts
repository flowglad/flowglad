import { NextResponse } from 'next/server'
import core from '@/utils/core'
import {
  SupabasePayloadType,
  SupabaseUpdatePayload,
  SupabaseInsertPayload,
} from '@/types'
import { invoiceUpdatedTask } from '@/trigger/supabase/invoice-updated'
import { productUpdatedTask } from '@/trigger/supabase/product-updated'
import { customerProfileCreatedTask } from '@/trigger/supabase/customer-profile-inserted'
import { Invoice } from '@/db/schema/invoices'
import { CustomerProfile } from '@/db/schema/customerProfiles'
import { Product } from '@/db/schema/products'
import { upsertProperNounTask } from '@/trigger/upsert-proper-noun'
import { databaseTablesForNoun } from '@/utils/properNounHelpers'

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization')
  if (
    !core.authorizationHeaderTokenMatchesEnvToken({
      headerValue: authHeader ?? '',
      tokenEnvVariableKey: 'THIRD_PARTY_REQUEST_TOKEN_SUPABASE',
    })
  ) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const payload = await request.json()
  if (payload.table in Object.values(databaseTablesForNoun)) {
    await upsertProperNounTask.trigger(payload)
  }

  const event = `${payload.table}:${payload.type}`
  switch (event) {
    case `Invoices:${SupabasePayloadType.UPDATE}`:
      await invoiceUpdatedTask.trigger(
        payload as SupabaseUpdatePayload<Invoice.Record>
      )
      break
    case `Products:${SupabasePayloadType.UPDATE}`:
      await productUpdatedTask.trigger(
        payload as SupabaseUpdatePayload<Product.Record>
      )
      break
    case `CustomerProfiles:${SupabasePayloadType.INSERT}`:
      await customerProfileCreatedTask.trigger(
        payload as SupabaseInsertPayload<CustomerProfile.Record>
      )
      break
    default:
      return NextResponse.json(
        { error: 'Unsupported event type' },
        { status: 200 }
      )
  }

  // Process the authorized request here
  // Process the authorized request here
  // For now, we'll just return a success message
  return NextResponse.json(
    { message: 'Authorized request processed successfully' },
    { status: 200 }
  )
}
