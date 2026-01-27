import type { EmailType } from './registry'

export interface EmailTriggerInfo {
  summary: string
  conditions: string[]
  triggerTask: {
    file: string
    taskId: string
  }
  decisionFunction?: {
    file: string
    exportName: string
  }
  workflowFile?: string
}

export const EMAIL_TRIGGER_MAP: Partial<
  Record<EmailType, EmailTriggerInfo>
> = {
  'customer.subscription.created': {
    summary: 'Sent when a customer subscribes to a paid plan',
    conditions: [
      'Price > $0 (not a free plan)',
      'Not a trial without payment method',
      'Customer has a valid email address',
      'Not upgrading from free (uses customer.subscription.upgraded instead)',
    ],
    triggerTask: {
      file: 'src/trigger/notifications/send-customer-subscription-created-notification.ts',
      taskId: 'send-customer-subscription-created-notification',
    },
    decisionFunction: {
      file: 'src/subscriptions/createSubscription/helpers.ts',
      exportName: 'determineSubscriptionNotifications',
    },
    workflowFile: 'src/subscriptions/createSubscription/workflow.ts',
  },
  'customer.subscription.upgraded': {
    summary:
      'Sent when a customer upgrades from a free plan to a paid plan',
    conditions: [
      'Customer had an active free subscription',
      'Free subscription was canceled as part of upgrade',
      'New subscription price > $0',
    ],
    triggerTask: {
      file: 'src/trigger/notifications/send-customer-subscription-upgraded-notification.ts',
      taskId: 'send-customer-subscription-upgraded-notification',
    },
    decisionFunction: {
      file: 'src/subscriptions/createSubscription/helpers.ts',
      exportName: 'determineSubscriptionNotifications',
    },
    workflowFile: 'src/subscriptions/createSubscription/workflow.ts',
  },
  'customer.subscription.canceled': {
    summary: 'Sent when a customer subscription is fully canceled',
    conditions: [
      'Subscription status changed to canceled',
      'Customer has a valid email address',
    ],
    triggerTask: {
      file: 'src/trigger/notifications/send-customer-subscription-canceled-notification.ts',
      taskId: 'send-customer-subscription-canceled-notification',
    },
  },
  'customer.subscription.cancellation-scheduled': {
    summary:
      'Sent when a customer schedules their subscription to cancel at period end',
    conditions: [
      'Customer requested cancellation at period end',
      'Subscription is still active until scheduled date',
    ],
    triggerTask: {
      file: 'src/trigger/notifications/send-customer-subscription-cancellation-scheduled-notification.ts',
      taskId:
        'send-customer-subscription-cancellation-scheduled-notification',
    },
  },
  'customer.subscription.adjusted': {
    summary:
      'Sent when a customer subscription is upgraded or downgraded',
    conditions: [
      'Subscription items/price changed',
      'Not a free-to-paid upgrade',
    ],
    triggerTask: {
      file: 'src/trigger/notifications/send-customer-subscription-adjusted-notification.ts',
      taskId: 'send-customer-subscription-adjusted-notification',
    },
  },
  'customer.payment.receipt': {
    summary: 'Sent when a payment is successfully processed',
    conditions: [
      'Payment succeeded',
      'Invoice exists for the payment',
    ],
    triggerTask: {
      file: 'src/trigger/notifications/send-customer-payment-succeeded-notification.ts',
      taskId: 'send-customer-payment-succeeded-notification',
    },
  },
  'customer.payment.failed': {
    summary: 'Sent when a payment fails to process',
    conditions: [
      'Payment failed',
      'Customer has a valid email address',
    ],
    triggerTask: {
      file: 'src/trigger/notifications/send-customer-payment-failed-notification.ts',
      taskId: 'send-customer-payment-failed-notification',
    },
  },
  'customer.trial.expired-no-payment': {
    summary:
      'Sent when a trial expires and no payment method is on file',
    conditions: [
      'Subscription was trialing',
      'Trial period ended',
      'No payment method on file',
    ],
    triggerTask: {
      file: 'src/trigger/notifications/send-customer-trial-expired-notification.ts',
      taskId: 'send-customer-trial-expired-notification',
    },
  },
  // Note: 'customer.auth.billing-portal-magic-link' and 'customer.auth.billing-portal-otp'
  // are sent directly via sendCustomerBillingPortalMagicLink and sendCustomerBillingPortalOTP
  // in src/utils/email.ts, not via trigger tasks.
  'organization.subscription.created': {
    summary:
      'Notifies organization when a customer creates a subscription',
    conditions: [
      'Customer subscription created successfully',
      'Price > $0 (not a free plan)',
    ],
    triggerTask: {
      file: 'src/trigger/notifications/send-organization-subscription-created-notification.ts',
      taskId: 'send-organization-subscription-created-notification',
    },
    decisionFunction: {
      file: 'src/subscriptions/createSubscription/helpers.ts',
      exportName: 'determineSubscriptionNotifications',
    },
  },
  'organization.subscription.canceled': {
    summary:
      'Notifies organization when a customer cancels their subscription',
    conditions: ['Subscription status changed to canceled'],
    triggerTask: {
      file: 'src/trigger/notifications/send-organization-subscription-canceled-notification.ts',
      taskId: 'send-organization-subscription-canceled-notification',
    },
  },
  'organization.subscription.cancellation-scheduled': {
    summary:
      'Notifies organization when a customer schedules a cancellation',
    conditions: ['Customer scheduled cancellation'],
    triggerTask: {
      file: 'src/trigger/notifications/send-organization-subscription-cancellation-scheduled-notification.ts',
      taskId:
        'send-organization-subscription-cancellation-scheduled-notification',
    },
  },
  'organization.subscription.adjusted': {
    summary:
      'Notifies organization when a customer adjusts their subscription',
    conditions: ['Subscription items/price changed'],
    triggerTask: {
      file: 'src/trigger/notifications/send-organization-subscription-adjusted-notification.ts',
      taskId: 'send-organization-subscription-adjusted-notification',
    },
  },
  // Note: 'organization.payment.succeeded' trigger task file does not exist.
  // This notification may be sent differently or not yet implemented.
  'organization.payment.failed': {
    summary: 'Notifies organization of a failed payment',
    conditions: ['Payment failed'],
    triggerTask: {
      file: 'src/trigger/notifications/send-organization-payment-failed-notification.ts',
      taskId: 'send-organization-payment-failed-notification',
    },
  },
}

export const getTriggerInfo = (
  emailType: EmailType
): EmailTriggerInfo | null => {
  return EMAIL_TRIGGER_MAP[emailType] ?? null
}
