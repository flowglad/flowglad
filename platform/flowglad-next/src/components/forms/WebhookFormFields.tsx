'use client'

import { useFormContext, Controller } from 'react-hook-form'
import { CreateWebhookInput } from '@/db/schema/webhooks'
import Input from '@/components/ion/Input'
import { FlowgladEventType } from '@/types'
import Checkbox from '@/components/ion/Checkbox'
import MultiSelect from './MultiSelect'
// import { MultiSelect } from '@/components/ion/ui/MultiSelect'

const WebhookFormFields = () => {
  const {
    register,
    formState: { errors },
    control,
  } = useFormContext<CreateWebhookInput>()

  const eventOptions = Object.values(FlowgladEventType).map(
    (type) => ({
      label: type,
      value: type,
    })
  )

  return (
    <div className="flex flex-col gap-4">
      <Input
        {...register('webhook.name')}
        label="Name"
        placeholder="e.g. Payment Webhook"
        error={errors.webhook?.name?.message}
      />
      <Input
        {...register('webhook.url')}
        label="URL"
        placeholder="e.g. https://api.example.com/webhooks"
        error={errors.webhook?.url?.message}
      />
      <Controller
        control={control}
        name="webhook.filterTypes"
        render={({ field }) => (
          <MultiSelect
            label="Event Types"
            placeholder="Select event types"
            options={eventOptions}
            value={field.value.map((type) => ({
              label: type,
              value: type,
            }))}
            onChange={field.onChange}
            error={errors.webhook?.filterTypes?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="webhook.active"
        render={({ field }) => (
          <Checkbox
            label="Active"
            checked={field.value}
            onCheckedChange={field.onChange}
            error={errors.webhook?.active?.message}
          />
        )}
      />
    </div>
  )
}

export default WebhookFormFields
