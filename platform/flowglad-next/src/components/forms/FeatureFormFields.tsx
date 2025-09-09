'use client'

import { useFormContext, Controller } from 'react-hook-form'
import {
  CreateFeatureInput,
  toggleFeatureDefaultColumns,
  usageCreditGrantFeatureDefaultColumns,
} from '@/db/schema/features'
import { Input } from '@/components/ui/input'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FeatureType, FeatureUsageGrantFrequency } from '@/types'
import NumberInput from '@/components/ion/NumberInput'
import UsageMetersSelect from './UsageMetersSelect'
import { AutoSlugInput } from '@/components/fields/AutoSlugInput'

import core, { titleCase } from '@/utils/core'
import { Switch } from '@/components/ui/switch'

const FeatureFormFields = ({ edit = false }: { edit?: boolean }) => {
  const form = useFormContext<CreateFeatureInput>()

  const featureType = form.watch('feature.type')
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
                  <NumberInput
                    {...field}
                    placeholder="e.g. 100"
                    value={field.value ?? undefined} // Ensure undefined for empty to avoid "0" display issues
                    onChange={(e) =>
                      field.onChange(
                        parseInt(e.target.value, 10) || null
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <UsageMetersSelect
            name="feature.usageMeterId"
            control={form.control}
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
      <Controller
        control={form.control}
        name="feature.active"
        render={({ field }) => (
          <Switch
            label="Active"
            checked={field.value}
            onCheckedChange={field.onChange}
          />
        )}
      />
    </div>
  )
}

export default FeatureFormFields
