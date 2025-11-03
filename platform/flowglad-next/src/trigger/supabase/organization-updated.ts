import { logger, task } from '@trigger.dev/sdk'
import { SupabaseUpdatePayload } from '@/types'
import { Organization } from '@/db/schema/organizations'
import {
  idempotentSendOrganizationPayoutsEnabledNotification,
} from '@/trigger/notifications/send-organization-payouts-enabled-notification'

interface ChangeCheckerParams {
  oldRecord: Organization.Record
  newRecord: Organization.Record
}

const payoutsEnabledChanged = (params: ChangeCheckerParams) => {
  const { oldRecord, newRecord } = params
  return (
    !oldRecord.payoutsEnabled &&
    newRecord.payoutsEnabled === true
  )
}

export const organizationUpdatedTask = task({
  id: 'organization-updated',
  run: async (
    payload: SupabaseUpdatePayload<Organization.Record>,
    { ctx }
  ) => {
    logger.log(JSON.stringify({ payload, ctx }, null, 2))

    const { old_record: oldRecord, record: newRecord } = payload

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

