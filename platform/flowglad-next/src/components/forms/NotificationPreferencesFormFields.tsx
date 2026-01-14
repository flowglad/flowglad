'use client'

import { Controller, useFormContext } from 'react-hook-form'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { NotificationPreferences } from '@/db/schema/memberships'

interface NotificationToggleProps {
  id: string
  name: keyof NotificationPreferences
  label: string
  description?: string
}

/**
 * Reusable toggle component for notification preferences
 */
const NotificationToggle = ({
  id,
  name,
  label,
  description,
}: NotificationToggleProps) => {
  const form = useFormContext<{
    preferences: Partial<NotificationPreferences>
  }>()

  return (
    <Controller
      control={form.control}
      name={`preferences.${name}`}
      render={({ field }) => (
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor={id}>{label}</Label>
            {description && (
              <div className="text-xs text-muted-foreground">
                {description}
              </div>
            )}
          </div>
          <Switch
            id={id}
            checked={field.value ?? true}
            onCheckedChange={field.onChange}
          />
        </div>
      )}
    />
  )
}

/**
 * Form fields for notification preferences.
 * Uses react-hook-form context and renders grouped toggles for all notification types.
 */
const NotificationPreferencesFormFields = () => {
  return (
    <div className="flex flex-col gap-6">
      {/* Test Mode Section */}
      <div className="flex flex-col gap-4">
        <div className="text-sm font-medium text-foreground">
          Test Mode
        </div>
        <NotificationToggle
          id="test-mode-notifications"
          name="testModeNotifications"
          label="Receive Test Mode Notifications"
          description="Enable to receive email notifications for test mode events"
        />
      </div>

      {/* Border separator */}
      <div className="border-t border-dashed border-border" />

      {/* Subscription Notifications Group */}
      <div className="flex flex-col gap-4">
        <div className="text-sm font-medium text-foreground">
          Subscription Notifications
        </div>
        <NotificationToggle
          id="subscription-created"
          name="subscriptionCreated"
          label="Subscription Created"
          description="Notify when a new subscription is created"
        />
        <NotificationToggle
          id="subscription-adjusted"
          name="subscriptionAdjusted"
          label="Subscription Adjusted"
          description="Notify when a subscription is upgraded or downgraded"
        />
        <NotificationToggle
          id="subscription-canceled"
          name="subscriptionCanceled"
          label="Subscription Canceled"
          description="Notify when a subscription is canceled"
        />
        <NotificationToggle
          id="subscription-cancellation-scheduled"
          name="subscriptionCancellationScheduled"
          label="Cancellation Scheduled"
          description="Notify when a cancellation is scheduled for the end of the billing period"
        />
      </div>

      {/* Payment Notifications Group */}
      <div className="flex flex-col gap-4">
        <div className="text-sm font-medium text-foreground">
          Payment Notifications
        </div>
        <NotificationToggle
          id="payment-failed"
          name="paymentFailed"
          label="Payment Failed"
          description="Notify when a payment fails"
        />
      </div>
    </div>
  )
}

export default NotificationPreferencesFormFields
