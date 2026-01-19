import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import { type Event, eventsSelectSchema } from '@/db/schema/events'
import { supabaseInsertPayloadSchema } from '@/db/supabase'
import {
  selectEventById,
  updateEvent,
} from '@/db/tableMethods/eventMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import type { SupabaseInsertPayload } from '@/types'
import { keysToCamelCase } from '@/utils/core'
import { storeTelemetry } from '@/utils/redis'
import { sendSvixEvent } from '@/utils/svix'

const eventInsertSchema = supabaseInsertPayloadSchema(
  eventsSelectSchema
)

export const eventInsertedTask = task({
  id: 'event-inserted',
  run: async (
    payload: SupabaseInsertPayload<Event.Record>,
    { ctx }
  ) => {
    /**
     *  Transform the record to camelCase and convert date strings to Date objects
     */
    const recordSnake = payload.record as Record<string, any>
    const transformedRecord = {
      ...keysToCamelCase(payload.record),
      /**
       * Must transform dates to Date objects to pass zod validation
       */
      createdAt: recordSnake.created_at
        ? new Date(recordSnake.created_at)
        : undefined,
      updatedAt: recordSnake.updated_at
        ? new Date(recordSnake.updated_at)
        : undefined,
      occurredAt: recordSnake.occurred_at
        ? new Date(recordSnake.occurred_at)
        : undefined,
      submittedAt: recordSnake.submitted_at
        ? new Date(recordSnake.submitted_at)
        : undefined,
      processedAt: recordSnake.processed_at
        ? new Date(recordSnake.processed_at)
        : null,
    }

    const parsedPayload = eventInsertSchema.safeParse({
      table: payload.table,
      schema: payload.schema,
      type: payload.type,
      record: transformedRecord,
    })

    if (!parsedPayload.success) {
      logger.error(parsedPayload.error.message)
      parsedPayload.error.issues.forEach((issue) => {
        logger.error(`${issue.path.join('.')}: ${issue.message}`)
      })
      throw new Error('Invalid payload')
    }

    const { record: event } = parsedPayload.data

    const {
      result,
      organization,
      event: mostUpToDateEvent,
    } = (
      await adminTransaction(async ({ transaction }) => {
        const existingEvent = await selectEventById(
          event.id,
          transaction
        )

        if (existingEvent?.processedAt) {
          return {
            eventId: event.id,
            result: 'already_processed',
          }
        }

        const updatedEvent = await updateEvent(
          { id: event.id, processedAt: Date.now() },
          transaction
        )
        const organization = await selectOrganizationById(
          event.organizationId,
          transaction
        )
        return {
          eventId: event.id,
          result: 'processed',
          organization,
          event: updatedEvent,
        }
      })
    ).unwrap()
    if (result === 'already_processed') {
      return result
    }
    if (mostUpToDateEvent) {
      await sendSvixEvent({
        event: mostUpToDateEvent,
        organization,
      })

      await storeTelemetry(
        'webhook',
        mostUpToDateEvent.id,
        ctx.run.id
      )
    }
    return result
  },
})
