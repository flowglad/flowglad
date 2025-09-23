import { NextResponse } from 'next/server'
import core from '@/utils/core'
import {
  SupabasePayloadType,
  SupabaseUpdatePayload,
  SupabaseInsertPayload,
} from '@/types'
import { invoiceUpdatedTask } from '@/trigger/supabase/invoice-updated'
import { customerCreatedTask } from '@/trigger/supabase/customer-inserted'
import { eventInsertedTask } from '@/trigger/supabase/event-inserted'
import { Invoice } from '@/db/schema/invoices'
import { Customer } from '@/db/schema/customers'
import { Event } from '@/db/schema/events'
import { subscribeToNewsletter } from '@/utils/newsletter'
import { User } from '@/db/schema/users'

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
    case `users:${SupabasePayloadType.INSERT}`:
      const userPayload =
        payload as SupabaseInsertPayload<User.Record>
      const email = userPayload.record.email
      if (email) {
        await subscribeToNewsletter(email)
      }
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
