import { SupabasePayloadType } from '@db-core/enums'
import { NextResponse } from 'next/server'
import type { Customer } from '@/db/schema/customers'
import type { Event } from '@/db/schema/events'
import type { Invoice } from '@/db/schema/invoices'
import type { Membership } from '@/db/schema/memberships'
import type { Organization } from '@/db/schema/organizations'
import { customerCreatedTask } from '@/trigger/supabase/customer-inserted'
import { eventInsertedTask } from '@/trigger/supabase/event-inserted'
import { invoiceUpdatedTask } from '@/trigger/supabase/invoice-updated'
import { memberInsertedTask } from '@/trigger/supabase/member-inserted'
import { organizationUpdatedTask } from '@/trigger/supabase/organization-updated'
import {
  type SupabaseDatabaseUpdatePayload,
  type SupabaseInsertPayload,
  type SupabaseUpdatePayload,
} from '@/types'
import core from '@/utils/core'

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

  const event = `${payload.table}:${payload.type}`
  switch (event) {
    case `memberships:${SupabasePayloadType.INSERT}`:
      await memberInsertedTask.trigger(
        payload as SupabaseInsertPayload<Membership.Record>
      )
      break
    case `invoices:${SupabasePayloadType.UPDATE}`:
      await invoiceUpdatedTask.trigger(
        payload as SupabaseUpdatePayload<Invoice.Record>
      )
      break
    case `customers:${SupabasePayloadType.INSERT}`:
      await customerCreatedTask.trigger(
        payload as SupabaseInsertPayload<Customer.Record>
      )
      break
    case `events:${SupabasePayloadType.INSERT}`:
      await eventInsertedTask.trigger(
        payload as SupabaseInsertPayload<Event.Record>
      )
      break
    case `organizations:${SupabasePayloadType.UPDATE}`:
      await organizationUpdatedTask.trigger(
        payload as SupabaseDatabaseUpdatePayload<Organization.Record>
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
