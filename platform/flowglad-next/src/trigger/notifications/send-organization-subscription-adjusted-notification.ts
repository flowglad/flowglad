import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import {
  OrganizationSubscriptionAdjustedEmail,
  type SubscriptionItem,
} from '@/email-templates/organization/organization-subscription-adjusted'
import type { CurrencyCode } from '@/types'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import { isNil } from '@/utils/core'
import {
  formatEmailSubject,
  getBccForLivemode,
  safeSend,
} from '@/utils/email'

export interface SendOrganizationSubscriptionAdjustedNotificationPayload {
  adjustmentId: string
  subscriptionId: string
  customerId: string
  organizationId: string
  adjustmentType: 'upgrade' | 'downgrade'
  previousItems: SubscriptionItem[]
  newItems: SubscriptionItem[]
  prorationAmount: number | null
  effectiveDate: number // timestamp
  currency: CurrencyCode
}

const sendOrganizationSubscriptionAdjustedNotificationTask = task({
  id: 'send-organization-subscription-adjusted-notification',
  run: async (
    payload: SendOrganizationSubscriptionAdjustedNotificationPayload,
    { ctx }
  ) => {
    logger.log(
      'Sending organization subscription adjusted notification',
      {
        payload,
        ctx,
      }
    )

    const {
      adjustmentId,
      subscriptionId,
      customerId,
      organizationId,
      adjustmentType,
      previousItems,
      newItems,
      prorationAmount,
      effectiveDate,
      currency,
    } = payload

    const {
      organization,
      customer,
      subscription,
      usersAndMemberships,
    } = await adminTransaction(async ({ transaction }) => {
      const organization = await selectOrganizationById(
        organizationId,
        transaction
      )
      const customer = await selectCustomerById(
        customerId,
        transaction
      )
      const subscription = await selectSubscriptionById(
        subscriptionId,
        transaction
      )
      const usersAndMemberships =
        await selectMembershipsAndUsersByMembershipWhere(
          {
            organizationId,
          },
          transaction
        )
      return {
        organization,
        customer,
        subscription,
        usersAndMemberships,
      }
    })

    if (!organization || !customer || !subscription) {
      throw new Error(
        'Organization, customer, or subscription not found'
      )
    }

    const previousTotalPrice = previousItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    )
    const newTotalPrice = newItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    )

    const isUpgrade = adjustmentType === 'upgrade'
    const subjectAction = isUpgrade ? 'upgraded' : 'downgraded'

    await safeSend({
      from: 'Flowglad <notifications@flowglad.com>',
      bcc: getBccForLivemode(subscription.livemode),
      to: usersAndMemberships
        .map(({ user }) => user.email)
        .filter((email) => !isNil(email)),
      subject: formatEmailSubject(
        `Subscription ${subjectAction}: ${customer.name} ${subjectAction} their subscription`,
        subscription.livemode
      ),
      react: OrganizationSubscriptionAdjustedEmail({
        organizationName: organization.name,
        customerName: customer.name,
        customerEmail: customer.email,
        customerId: customer.id,
        adjustmentType,
        previousItems,
        newItems,
        previousTotalPrice,
        newTotalPrice,
        currency,
        prorationAmount,
        effectiveDate: new Date(effectiveDate),
        livemode: subscription.livemode,
      }),
    })

    return {
      message:
        'Organization subscription adjusted notification sent successfully',
    }
  },
})

export const idempotentSendOrganizationSubscriptionAdjustedNotification =
  testSafeTriggerInvoker(
    async (
      params: SendOrganizationSubscriptionAdjustedNotificationPayload
    ) => {
      await sendOrganizationSubscriptionAdjustedNotificationTask.trigger(
        params,
        {
          idempotencyKey: await createTriggerIdempotencyKey(
            `send-organization-subscription-adjusted-notification-${params.adjustmentId}`
          ),
        }
      )
    }
  )
