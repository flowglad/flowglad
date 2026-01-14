'use client'

import { Controller, useFormContext } from 'react-hook-form'
import { AutoSlugInput } from '@/components/fields/AutoSlugInput'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  type CreateFeatureInput,
  // FIXME: FEATURE - Resource UI is temporarily disabled while resource features are gated behind devOnlyProcedure
  // resourceFeatureDefaultColumns,
  toggleFeatureDefaultColumns,
  usageCreditGrantFeatureDefaultColumns,
} from '@/db/schema/features'
import { FeatureType, FeatureUsageGrantFrequency } from '@/types'
import core, { titleCase } from '@/utils/core'
// FIXME: FEATURE - Resource UI is temporarily disabled while resource features are gated behind devOnlyProcedure
// import ResourcesSelect from './ResourcesSelect'
import UsageMetersSelect from './UsageMetersSelect'

const FeatureFormFields = ({ edit = false }: { edit?: boolean }) => {
  const form = useFormContext<CreateFeatureInput>()

  const featureType = form.watch('feature.type')
  const pricingModelId = form.watch('feature.pricingModelId')
  if (!core.IS_PROD) {
    // eslint-disable-next-line no-console
    console.log('errors', form.formState.errors)
  }
  const assignFeatureValueFromTuple = (tuple: [string, any]) => {
    const [key, value] = tuple
    // @ts-expect-error - key is a valid key of usagePriceDefaultColumns
    form.setValue(`feature.${key}`, value)
  }

  return (
    <div className="flex flex-col gap-4">
      <FormField
        control={form.control}
        name="feature.name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input
                placeholder="e.g. My Awesome Feature"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="feature.slug"
        render={() => (
          <FormItem>
            <FormLabel>Slug</FormLabel>
            <FormControl>
              <AutoSlugInput
                name="feature.slug"
                sourceName="feature.name"
                placeholder="feature_slug"
                disabledAuto={edit}
              />
            </FormControl>
            <FormDescription>
              Used to check access on the SDK. Must be unique within
              each pricing model.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="feature.description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Input placeholder="Describe the feature" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <Controller
        control={form.control}
        name="feature.type"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Type</FormLabel>
            <FormControl>
              <Select
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value)
                  // Reset fields when type changes
                  if (value === FeatureType.Toggle) {
                    Object.entries(
                      toggleFeatureDefaultColumns
                    ).forEach(assignFeatureValueFromTuple)
                  }
                  if (value === FeatureType.UsageCreditGrant) {
                    Object.entries(
                      usageCreditGrantFeatureDefaultColumns
                    ).forEach(assignFeatureValueFromTuple)
                  }
                  // FIXME: FEATURE - Resource UI is temporarily disabled while resource features are gated behind devOnlyProcedure
                  // if (value === FeatureType.Resource) {
                  //   Object.entries(
                  //     resourceFeatureDefaultColumns
                  //   ).forEach(assignFeatureValueFromTuple)
                  // }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FeatureType.Toggle}>
                    <div>
                      <div>Toggle</div>
                      <div className="text-xs text-muted-foreground">
                        Boolean access to a feature.
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value={FeatureType.UsageCreditGrant}>
                    <div>
                      <div>Usage Credit Grant</div>
                      <div className="text-xs text-muted-foreground">
                        Credits towards a specific usage meter.
                      </div>
                    </div>
                  </SelectItem>
                  {/* FIXME: FEATURE - Resource UI is temporarily disabled while resource features are gated behind devOnlyProcedure
                  <SelectItem value={FeatureType.Resource}>
                    <div>
                      <div>Resource</div>
                      <div className="text-xs text-muted-foreground">
                        Claimable capacity (seats, API keys, etc.)
                      </div>
                    </div>
                  </SelectItem>
                  */}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {featureType === FeatureType.UsageCreditGrant && (
        <>
          <FormField
            control={form.control}
            name="feature.amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="e.g. 100"
                    value={field.value?.toString() ?? ''}
                    onChange={(e) => {
                      const value = e.target.value
                      if (value) {
                        const intValue = parseInt(value, 10)
                        if (!isNaN(intValue)) {
                          field.onChange(intValue)
                        }
                      } else {
                        field.onChange(null)
                      }
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <UsageMetersSelect
            name="feature.usageMeterId"
            control={form.control}
            pricingModelId={pricingModelId}
          />
          <FormField
            control={form.control}
            name="feature.renewalFrequency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Renewal Frequency</FormLabel>
                <FormControl>
                  <Select
                    value={field.value ?? ''}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select renewal frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(FeatureUsageGrantFrequency).map(
                        (value) => (
                          <SelectItem key={value} value={value}>
                            {titleCase(value)}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}

      {/* FIXME: FEATURE - Resource UI is temporarily disabled while resource features are gated behind devOnlyProcedure
      {featureType === FeatureType.Resource && (
        <>
          <FormField
            control={form.control}
            name="feature.amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Capacity</FormLabel>
                <FormDescription>
                  Maximum number of claims allowed per subscription
                  unit
                </FormDescription>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    placeholder="e.g. 10"
                    value={field.value?.toString() ?? ''}
                    onChange={(e) => {
                      const value = e.target.value
                      if (value) {
                        const intValue = parseInt(value, 10)
                        if (!isNaN(intValue)) {
                          field.onChange(intValue)
                        }
                      } else {
                        field.onChange(null)
                      }
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <ResourcesSelect
            name="feature.resourceId"
            control={form.control}
            pricingModelId={pricingModelId}
          />
        </>
      )}
      */}
      <Controller
        control={form.control}
        name="feature.active"
        render={({ field }) => (
          <div className="flex items-center space-x-2">
            <Switch
              id="feature-active"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
            <Label
              htmlFor="feature-active"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Active
            </Label>
          </div>
        )}
      />
    </div>
  )
}

export default FeatureFormFields
