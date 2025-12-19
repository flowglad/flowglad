import { logger, task } from '@trigger.dev/sdk'
import type { Organization } from '@/db/schema/organizations'
import { idempotentSendOrganizationPayoutsEnabledNotification } from '@/trigger/notifications/send-organization-payouts-enabled-notification'
import type {
  SupabaseDatabaseRecord,
  SupabaseDatabaseUpdatePayload,
} from '@/types'

interface ChangeCheckerParams {
  oldRecord: SupabaseDatabaseRecord<Organization.Record>
  newRecord: SupabaseDatabaseRecord<Organization.Record>
}

const payoutsEnabledChanged = (params: ChangeCheckerParams) => {
  const { oldRecord, newRecord } = params
  return (
    !oldRecord.payouts_enabled && newRecord.payouts_enabled === true
  )
}

export const organizationUpdatedTask = task({
  id: 'organization-updated',
  run: async (
    payload: SupabaseDatabaseUpdatePayload<Organization.Record>,
    { ctx }
  ) => {
    const { old_record: oldRecord, record: newRecord } = payload

    logger.log(
      JSON.stringify(
        {
          organizationId: newRecord.id,
          organizationName: newRecord.name,
          oldPayoutsEnabled: oldRecord.payouts_enabled,
          newPayoutsEnabled: newRecord.payouts_enabled,
          ctx,
        },
        null,
        2
      )
    )

    if (payoutsEnabledChanged({ oldRecord, newRecord })) {
      logger.info(
        `Payouts enabled for organization ${newRecord.id}, sending notification`
      )
      await idempotentSendOrganizationPayoutsEnabledNotification(
        newRecord.id
      )
    }

    return {
      message: 'Organization update processed',
    }
  },
})
