'use client'

import { Controller, useFormContext } from 'react-hook-form'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ActiveStatusTag,
  booleanToActiveStatus,
} from '@/components/ui/status-tag'
import { Switch } from '@/components/ui/switch'
import type { CreateWebhookInput } from '@/db/schema/webhooks'
import { FlowgladEventType } from '@/types'
import MultiSelect, { type Option } from './MultiSelect'

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
                  <ActiveStatusTag
                    status={booleanToActiveStatus(
                      field.value ?? false
                    )}
                  />
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
