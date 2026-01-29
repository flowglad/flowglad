'use client'

import { IntervalUnit, PriceType } from '@db-core/enums'
import { Info } from 'lucide-react'
import { useFormContext } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { trpc } from '@/app/_trpc/client'
import { AutoSlugInput } from '@/components/fields/AutoSlugInput'
import FormModal from '@/components/forms/FormModal'
import PriceFormFields from '@/components/forms/PriceFormFields'
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
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { createPriceFormSchema } from '@/db/schema/prices'
import type { UsageMeter } from '@/db/schema/usageMeters'
import {
  isCurrencyZeroDecimal,
  rawStringAmountToCountableCurrencyAmount,
} from '@/utils/stripe'

/**
 * Form schema for CreateUsagePriceModal.
 *
 * Uses createPriceFormSchema which wraps the prices.create API input.
 * Adds a refinement to require a non-empty slug.
 */
const createUsagePriceFormSchema = createPriceFormSchema.refine(
  (data) => {
    const slug = data.price.slug?.trim()
    return slug !== undefined && slug !== null && slug.length >= 1
  },
  {
    message: 'Slug is required and must be at least 1 character',
    path: ['price', 'slug'],
  }
)

export type CreateUsagePriceFormSchema = z.infer<
  typeof createUsagePriceFormSchema
>

/**
 * Name and Slug fields for the usage price form.
 * Name is entered by user, Slug auto-fills from Name following the standard pattern.
 */
function NameAndSlugFields() {
  const { control } = useFormContext<CreateUsagePriceFormSchema>()

  return (
    <>
      <FormField
        control={control}
        name="price.name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ''}
                placeholder="Usage Price"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="price.slug"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Slug</FormLabel>
            <FormControl>
              <AutoSlugInput
                {...field}
                name="price.slug"
                sourceName="price.name"
                placeholder="usage-price-slug"
                className="w-full"
              />
            </FormControl>
            <FormDescription>
              A unique identifier for this usage price
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  )
}

/**
 * Toggle field for setting whether this price is the default for the usage meter.
 */
function IsDefaultField() {
  const { control } = useFormContext<CreateUsagePriceFormSchema>()

  return (
    <FormField
      control={control}
      name="price.isDefault"
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <div className="flex items-center space-x-2">
              <Switch
                id="price-isDefault"
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-label="Set as default price"
              />
              <Label
                htmlFor="price-isDefault"
                className="cursor-pointer"
              >
                Make Default
              </Label>
              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="More information"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    variant="muted"
                    side="top"
                    className="max-w-xs text-sm px-3 py-2"
                  >
                    The default price is used when usage events are
                    created with just the meter identifier.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

interface CreateUsagePriceModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  usageMeter: UsageMeter.ClientRecord
}

/**
 * CreateUsagePriceModal component
 *
 * Creates a new usage price for a specific usage meter.
 * Usage prices belong directly to usage meters (not products),
 * so this calls prices.create with productId: null.
 */
export const CreateUsagePriceModal = ({
  isOpen,
  setIsOpen,
  usageMeter,
}: CreateUsagePriceModalProps) => {
  const { organization } = useAuthenticatedContext()
  const createPrice = trpc.prices.create.useMutation()
  const utils = trpc.useUtils()

  if (!organization) {
    return null
  }

  const zeroDecimal = isCurrencyZeroDecimal(
    organization.defaultCurrency
  )

  // Default values for usage price form
  // Note: currency and pricingModelId are read-only and derived server-side
  const getDefaultValues = (): CreateUsagePriceFormSchema => ({
    price: {
      type: PriceType.Usage,
      name: '',
      slug: '',
      isDefault: true,
      usageMeterId: usageMeter.id,
      usageEventsPerUnit: 1,
      unitPrice: 0,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      trialPeriodDays: null, // Usage prices don't have trial periods
      productId: null, // Usage prices belong to meters, not products
    },
    __rawPriceString: zeroDecimal ? '0' : '0.00',
  })

  return (
    <FormModal
      title="Create Usage Price"
      formSchema={createUsagePriceFormSchema}
      defaultValues={getDefaultValues}
      onSubmit={async (input) => {
        const unitPrice = rawStringAmountToCountableCurrencyAmount(
          organization.defaultCurrency,
          input.__rawPriceString!
        )

        const trimmedSlug = input.price.slug?.trim() ?? ''
        const trimmedName = input.price.name?.trim() || trimmedSlug

        await createPrice.mutateAsync({
          price: {
            type: PriceType.Usage,
            name: trimmedName,
            slug: trimmedSlug,
            unitPrice,
            usageMeterId: usageMeter.id,
            usageEventsPerUnit: input.price.usageEventsPerUnit ?? 1,
            isDefault: input.price.isDefault,
            intervalUnit:
              input.price.intervalUnit ?? IntervalUnit.Month,
            intervalCount: input.price.intervalCount ?? 1,
            trialPeriodDays: null,
            productId: null,
          },
        })
      }}
      onSuccess={async () => {
        // Invalidate the prices query to refresh the grid
        await utils.prices.getTableRows.invalidate()
        toast.success('Usage price created successfully')
      }}
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      submitButtonText="Create Price"
    >
      <NameAndSlugFields />
      <PriceFormFields
        priceOnly={true}
        pricingModelId={usageMeter.pricingModelId}
        hideUsageMeter={true}
        disablePriceType={true}
        hidePriceName={true}
        hidePriceType={true}
      />
      <IsDefaultField />
    </FormModal>
  )
}

export default CreateUsagePriceModal
