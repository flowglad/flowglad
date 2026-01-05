'use client'

import { useFormContext } from 'react-hook-form'
import { z } from 'zod'
import { trpc } from '@/app/_trpc/client'
import { AutoSlugInput } from '@/components/fields/AutoSlugInput'
import FormModal from '@/components/forms/FormModal'
import UsageMetersSelect from '@/components/forms/UsageMetersSelect'
import StatusBadge from '@/components/StatusBadge'
import { CurrencyInput } from '@/components/ui/currency-input'
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
import { useAuthenticatedContext } from '@/contexts/authContext'
import { type Price } from '@/db/schema/prices'
import { currencyCharacter } from '@/registry/lib/currency'
import { PriceType } from '@/types'
import {
  countableCurrencyAmountToRawStringAmount,
  isCurrencyZeroDecimal,
  rawStringAmountToCountableCurrencyAmount,
} from '@/utils/stripe'

interface EditUsagePriceModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  price: Price.ClientUsageRecord
  usageMeterId: string
  pricingModelId?: string
}

/**
 * Form schema for editing a usage price.
 * Includes all editable fields: name, slug, active, unitPrice (via __rawPriceString), and usageEventsPerUnit.
 * When unitPrice or usageEventsPerUnit change, a new price is created and the old one is inactivated.
 */
const editUsagePriceFormSchema = z.object({
  price: z.object({
    type: z.literal(PriceType.Usage),
    id: z.string(),
    isDefault: z.boolean(),
    active: z.boolean(),
    name: z.string().nullable().optional(),
    slug: z.string().nullable().optional(),
    usageMeterId: z.string(),
  }),
  id: z.string(),
  __rawPriceString: z.string(),
  usageEventsPerUnit: z.number().int().positive(),
})

type EditUsagePriceFormSchema = z.infer<
  typeof editUsagePriceFormSchema
>

interface UsagePriceFormFieldsProps {
  pricingModelId?: string
}

/**
 * Form fields for editing a usage price.
 * Name, slug, status, amount, and usage events per unit are all editable.
 * Price type and usage meter are shown as read-only.
 *
 * When amount or usage events per unit change, the form submission will
 * create a new price and inactivate the old one (immutable price pattern).
 */
const UsagePriceFormFields = ({
  pricingModelId,
}: UsagePriceFormFieldsProps) => {
  const form = useFormContext<EditUsagePriceFormSchema>()
  const { organization } = useAuthenticatedContext()
  const zeroDecimal = isCurrencyZeroDecimal(
    organization!.defaultCurrency
  )

  return (
    <div className="relative flex justify-between items-start gap-2.5 bg-background">
      <div className="flex-1 w-full min-w-[460px] relative flex flex-col rounded-lg-md">
        <div className="w-full relative flex flex-col items-start">
          <div className="flex-1 w-full relative flex flex-col justify-center gap-6">
            {/* Price Name */}
            <FormField
              control={form.control}
              name="price.name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Usage Price"
                      className="w-full"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Price Slug */}
            <FormField
              control={form.control}
              name="price.slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price Slug</FormLabel>
                  <FormControl>
                    <AutoSlugInput
                      {...field}
                      name="price.slug"
                      sourceName="price.name"
                      placeholder="price_slug"
                      disabledAuto={true}
                      className="w-full"
                    />
                  </FormControl>
                  <FormDescription className="text-xs text-muted-foreground mt-1">
                    Used to identify the price via API.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Status (Active/Inactive toggle) */}
            <FormField
              control={form.control}
              name="price.active"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <FormControl>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="price-active"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <Label
                        htmlFor="price-active"
                        className="cursor-pointer w-full"
                      >
                        {field.value ? (
                          <StatusBadge active={true} />
                        ) : (
                          <StatusBadge active={false} />
                        )}
                      </Label>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Price Type - Shown but disabled */}
            <FormItem>
              <FormLabel>Price Type</FormLabel>
              <Select value={PriceType.Usage} disabled>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PriceType.Usage}>
                    Usage
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Price type cannot be changed.
              </FormDescription>
            </FormItem>

            {/* Amount and Usage Events Per Unit - Side by side layout */}
            <div className="flex flex-col md:flex-row items-end gap-2.5">
              <FormField
                control={form.control}
                name="__rawPriceString"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Amount</FormLabel>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {currencyCharacter(
                          organization!.defaultCurrency
                        )}
                      </span>
                      <FormControl>
                        <CurrencyInput
                          value={field.value?.toString() ?? ''}
                          onValueChange={(value) => {
                            if (!value) {
                              const zeroValue = zeroDecimal
                                ? '0'
                                : '0.00'
                              field.onChange(zeroValue)
                              return
                            }
                            field.onChange(value)
                          }}
                          allowDecimals={!zeroDecimal}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="usageEventsPerUnit"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Usage Events Per Unit</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={2147483647}
                        step={1}
                        placeholder="e.g. 100"
                        value={field.value?.toString() ?? ''}
                        onChange={(e) => {
                          const value = e.target.value
                          const numValue = Number(value)
                          if (!isNaN(numValue)) {
                            field.onChange(numValue)
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Usage Meter - Shown but disabled (following edit product modal pattern) */}
            <UsageMetersSelect
              name="price.usageMeterId"
              control={form.control}
              disabled={true}
              pricingModelId={pricingModelId}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * EditUsagePriceModal - A tray/drawer modal for editing usage prices.
 *
 * Modeled after EditProductModal, this component allows editing:
 * - Price Name
 * - Price Slug
 * - Status (Active/Inactive)
 * - Amount (unitPrice)
 * - Usage Events Per Unit
 *
 * When amount or usage events per unit change, a new price is created
 * and the old price is inactivated (immutable price pattern).
 *
 * The following fields are displayed but cannot be edited:
 * - Price Type (always "Usage")
 * - Usage Meter (associated via usageMeterId)
 */
const EditUsagePriceModal: React.FC<EditUsagePriceModalProps> = ({
  isOpen,
  setIsOpen,
  price,
  usageMeterId,
  pricingModelId,
}) => {
  const utils = trpc.useUtils()
  const updatePrice = trpc.prices.update.useMutation()
  const createPrice = trpc.prices.create.useMutation()
  const { organization } = useAuthenticatedContext()

  // Don't render modal if organization is not loaded yet
  if (!organization) {
    return null
  }

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Edit Usage Price"
      formSchema={editUsagePriceFormSchema}
      defaultValues={{
        price: {
          type: PriceType.Usage,
          id: price.id,
          isDefault: price.isDefault,
          active: price.active,
          name: price.name,
          slug: price.slug,
          usageMeterId: usageMeterId,
        },
        id: price.id,
        __rawPriceString: countableCurrencyAmountToRawStringAmount(
          organization.defaultCurrency,
          price.unitPrice
        ),
        usageEventsPerUnit: price.usageEventsPerUnit ?? 1,
      }}
      onSubmit={async (input) => {
        const newUnitPrice = rawStringAmountToCountableCurrencyAmount(
          organization.defaultCurrency,
          input.__rawPriceString
        )

        // Check if immutable fields have changed
        const unitPriceChanged = newUnitPrice !== price.unitPrice
        const usageEventsPerUnitChanged =
          input.usageEventsPerUnit !== price.usageEventsPerUnit

        if (unitPriceChanged || usageEventsPerUnitChanged) {
          // Immutable fields changed: create new price
          // safelyInsertPrice automatically archives all existing prices for the product
          await createPrice.mutateAsync({
            price: {
              type: PriceType.Usage,
              productId: price.productId,
              unitPrice: newUnitPrice,
              usageEventsPerUnit: input.usageEventsPerUnit,
              usageMeterId: usageMeterId,
              isDefault: price.isDefault,
              name: input.price.name,
              slug: input.price.slug,
              intervalUnit: price.intervalUnit,
              intervalCount: price.intervalCount,
              trialPeriodDays: null,
            },
          })
        } else {
          // Only mutable fields changed: use update mutation
          // Extract only mutable fields (exclude usageMeterId which is create-only)
          const { usageMeterId: _, ...mutablePriceFields } =
            input.price
          await updatePrice.mutateAsync({
            price: mutablePriceFields,
            id: input.id,
          })
        }

        // Invalidate the prices query to refresh the grid
        await utils.prices.getTableRows.invalidate()
      }}
      key={price.id}
      mode="drawer"
    >
      <UsagePriceFormFields pricingModelId={pricingModelId} />
    </FormModal>
  )
}

export default EditUsagePriceModal
