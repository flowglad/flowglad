'use client'

import { useFormContext, Controller } from 'react-hook-form'
import { CreateWebhookInput } from '@/db/schema/webhooks'
import { Input } from '@/components/ui/input'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { FlowgladEventType } from '@/types'
import MultiSelect, { Option } from './MultiSelect'

import StatusBadge from '../StatusBadge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
// import { MultiSelect } from '@/components/ion/ui/MultiSelect'

const WebhookFormFields = ({ edit = false }: { edit?: boolean }) => {
  const form = useFormContext<CreateWebhookInput>()

  const eventOptions = Object.values(FlowgladEventType).map(
    (type) => ({
      label: type,
      value: type,
    })
  )

  return (
    <div className="flex flex-col gap-4 max-w-md">
      <FormField
        control={form.control}
        name="webhook.name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input placeholder="e.g. Payment Webhook" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="webhook.url"
        render={({ field }) => (
          <FormItem>
            <FormLabel>URL</FormLabel>
            <FormControl>
              <Input
                placeholder="e.g. https://api.example.com/webhooks"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <Controller
        control={form.control}
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
            error={
              form.formState.errors.webhook?.filterTypes?.message
            }
          />
        )}
      />
      {edit && (
        <div className="w-full relative flex flex-col gap-3">
          <FormLabel>Status</FormLabel>
          <Controller
            name="webhook.active"
            control={form.control}
            render={({ field }) => (
              <div className="flex items-center space-x-2">
                <Switch
                  id="webhook-active"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label
                  htmlFor="webhook-active"
                  className="cursor-pointer w-full"
                >
                  {field.value ? (
                    <StatusBadge active={true} />
                  ) : (
                    <StatusBadge active={false} />
                  )}
                </Label>
              </div>
            )}
          />
        </div>
      )}
    </div>
  )
}

export default WebhookFormFields
