import { logger, task } from '@trigger.dev/sdk'
import { Event } from '@/db/schema/events'
import { SupabaseInsertPayload } from '@/types'
import { supabaseInsertPayloadSchema } from '@/db/supabase'
import { eventsSelectSchema } from '@/db/schema/events'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectEventById,
  updateEvent,
} from '@/db/tableMethods/eventMethods'

const eventInsertSchema = supabaseInsertPayloadSchema(
  eventsSelectSchema
)

export const eventInsertedTask = task({
  id: 'event-inserted',
  run: async (
    payload: SupabaseInsertPayload<Event.Record>,
    { ctx }
  ) => {
    logger.log(JSON.stringify({ payload, ctx }))

    const parsedPayload = eventInsertSchema.safeParse(payload)
    if (!parsedPayload.success) {
      logger.error(parsedPayload.error.message)
      parsedPayload.error.issues.forEach((issue) => {
        logger.error(`${issue.path.join('.')}: ${issue.message}`)
      })
      throw new Error('Invalid payload')
    }

    const { record: event } = parsedPayload.data

    const result = await adminTransaction(async ({ transaction }) => {
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

      await updateEvent(
        { id: event.id, processedAt: new Date() },
        transaction
      )

      return { eventId: event.id, result: 'processed' }
    })

    return result
  },
})
