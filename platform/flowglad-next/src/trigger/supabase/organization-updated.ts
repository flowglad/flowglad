import { logger, task } from '@trigger.dev/sdk'
import type { Organization } from '@/db/schema/organizations'
import { idempotentSendOrganizationPayoutsEnabledNotification } from '@/trigger/notifications/send-organization-payouts-enabled-notification'
import type { SupabaseUpdatePayload } from '@/types'

interface ChangeCheckerParams {
  oldRecord: Organization.Record
  newRecord: Organization.Record
}

const payoutsEnabledChanged = (params: ChangeCheckerParams) => {
  const { oldRecord, newRecord } = params
  return (
    !oldRecord.payoutsEnabled && newRecord.payoutsEnabled === true
  )
}

export const organizationUpdatedTask = task({
  id: 'organization-updated',
  run: async (
    payload: SupabaseUpdatePayload<Organization.Record>,
    { ctx }
  ) => {
    const { old_record: oldRecord, record: newRecord } = payload

    logger.log(
      JSON.stringify(
        {
          organizationId: newRecord.id,
          organizationName: newRecord.name,
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
