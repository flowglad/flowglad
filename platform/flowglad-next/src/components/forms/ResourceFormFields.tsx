'use client'

import { Controller, useFormContext } from 'react-hook-form'
import { AutoSlugInput } from '@/components/fields/AutoSlugInput'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { CreateResourceInput } from '@/db/schema/resources'
import StatusBadge from '../StatusBadge'
import PricingModelSelect from './PricingModelSelect'

interface ResourceFormFieldsProps {
  edit?: boolean
  hidePricingModelSelect?: boolean
}

const ResourceFormFields: React.FC<ResourceFormFieldsProps> = ({
  edit,
  hidePricingModelSelect,
}) => {
  const form = useFormContext<CreateResourceInput>()

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="resource.name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input placeholder="Resource Name" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {!edit && !hidePricingModelSelect && (
        <div className="w-full relative flex flex-col gap-3">
          <PricingModelSelect
            name="resource.pricingModelId"
            control={form.control}
          />
        </div>
      )}
      <div className="w-full relative flex flex-col gap-3">
        <FormField
          control={form.control}
          name="resource.slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug</FormLabel>
              <FormControl>
                <AutoSlugInput
                  {...field}
                  name="resource.slug"
                  sourceName="resource.name"
                  placeholder="resource_slug"
                  disabledAuto={edit}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="w-full relative flex flex-col gap-3">
        <FormLabel>Status</FormLabel>
        <Controller
          name="resource.active"
          control={form.control}
          render={({ field }) => (
            <div className="flex items-center space-x-2">
              <Switch
                id="resource-active"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label
                htmlFor="resource-active"
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
    </div>
  )
}

export default ResourceFormFields
