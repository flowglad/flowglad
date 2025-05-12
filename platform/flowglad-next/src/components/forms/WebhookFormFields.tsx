'use client'

import { useFormContext, Controller } from 'react-hook-form'
import { CreateWebhookInput } from '@/db/schema/webhooks'
import Input from '@/components/ion/Input'
import { FlowgladEventType } from '@/types'
import MultiSelect, { Option } from './MultiSelect'
import Label from '@/components/ion/Label'
import StatusBadge from '../StatusBadge'
import Switch from '../ion/Switch'
// import { MultiSelect } from '@/components/ion/ui/MultiSelect'

const WebhookFormFields = ({ edit = false }: { edit?: boolean }) => {
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
    <div className="flex flex-col gap-4 max-w-md">
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
              label: String(type),
              value: String(type),
            }))}
            className="max-w-md"
            onChange={(selectedOptions: Option[]) => {
              field.onChange(
                selectedOptions.map((option) => option.value)
              )
            }}
            error={errors.webhook?.filterTypes?.message}
          />
        )}
      />
      {edit && (
        <div className="w-full relative flex flex-col gap-3">
          <Label>Status</Label>
          <Controller
            name="webhook.active"
            control={control}
            render={({ field }) => (
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                label={
                  <div className="cursor-pointer w-full">
                    {field.value ? (
                      <StatusBadge active={true} />
                    ) : (
                      <StatusBadge active={false} />
                    )}
                  </div>
                }
              />
            )}
          />
        </div>
      )}
    </div>
  )
}

export default WebhookFormFields
