import { PriceType } from '@db-core/enums'
import type { CreateProductSchema } from '@db-core/schema/prices'
import type { Product } from '@db-core/schema/products'
import { useEffect } from 'react'
import { useFormContext } from 'react-hook-form'
import { trpc } from '@/app/_trpc/client'
import { usePriceFormContext } from '@/app/hooks/usePriceFormContext'
import FileInput from '@/components/FileInput'
import { AutoSlugInput } from '@/components/fields/AutoSlugInput'
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
import {
  ActiveStatusTag,
  booleanToActiveStatus,
} from '@/components/ui/status-tag'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import core from '@/utils/core'
import ProductFeatureMultiSelect from './ProductFeatureMultiSelect'

export const ProductFormFields = ({
  editProduct = false,
}: {
  editProduct?: boolean
}) => {
  const form = useFormContext<CreateProductSchema>()
  const priceForm = usePriceFormContext()
  const product = form.watch('product')
  const focusedMembership =
    trpc.organizations.getFocusedMembership.useQuery()
  const focusedPricingModelId =
    focusedMembership.data?.pricingModel?.id
  const priceType = priceForm.watch('price.type')
  const isDefaultProduct = product?.default === true

  // Ensure default products remain active in UI
  useEffect(() => {
    if (isDefaultProduct && product?.active !== true) {
      form.setValue('product.active', true)
    }
  }, [isDefaultProduct, product?.active, form])

  // Clear featureIds when price type is 'usage' (no features allowed for usage prices)
  useEffect(() => {
    if (!editProduct && priceType === PriceType.Usage) {
      form.setValue('featureIds', [])
    }
    // FIXME(FG-384): Fix this warning:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceType, form])

  if (
    !core.IS_PROD &&
    Object.keys(form.formState.errors).length > 0
  ) {
    // FIXME(FG-384): Fix this warning:
    // eslint-disable-next-line no-console
    console.log('errors', form.formState.errors)
  }
  return (
    <div className="relative flex justify-between items-start gap-2.5 bg-background">
      <div className="flex-1 w-full relative flex flex-col rounded-lg-md">
        <div className="w-full relative flex flex-col items-start">
          <div className="flex-1 w-full relative flex flex-col justify-center gap-6">
            {isDefaultProduct && (
              <p className="text-xs text-muted-foreground">
                Product slug, price slug, status, price type, price
                amount, and trial settings are locked on default
                plans.
              </p>
            )}
            <FormField
              control={form.control}
              name="product.name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Product"
                      className="w-full"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="product.slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Slug</FormLabel>
                  <FormControl>
                    <AutoSlugInput
                      {...field}
                      name="product.slug"
                      sourceName="product.name"
                      placeholder="product_slug"
                      disabledAuto={editProduct || isDefaultProduct}
                      disabled={isDefaultProduct}
                      className="w-full"
                    />
                  </FormControl>
                  <FormDescription className="text-xs text-muted-foreground mt-1">
                    Used to identify the product via API. Must be
                    unique per-pricing model.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="product.description"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Description</FormLabel>
                  </div>
                  <FormControl>
                    <Textarea
                      placeholder="Product description"
                      className="w-full"
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormDescription className="text-xs text-muted-foreground mt-1">
                    Details about your product that will be displayed
                    on the purchase page.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {editProduct && (
              <FormField
                control={form.control}
                name="product.active"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <FormControl>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="product-active"
                          checked={field.value}
                          disabled={isDefaultProduct}
                          onCheckedChange={field.onChange}
                        />
                        <Label
                          htmlFor="product-active"
                          className="cursor-pointer w-full"
                        >
                          <ActiveStatusTag
                            status={booleanToActiveStatus(
                              field.value
                            )}
                          />
                        </Label>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
          <div className="w-full mt-6">
            <PriceFormFields
              edit={editProduct}
              pricingModelId={focusedPricingModelId}
            />
          </div>
          {priceType !== PriceType.Usage && (
            <div className="w-full mt-6">
              <ProductFeatureMultiSelect
                pricingModelId={focusedPricingModelId ?? ''}
                productId={
                  editProduct
                    ? (product as unknown as Product.ClientUpdate).id
                    : undefined
                }
                priceType={priceType}
              />
            </div>
          )}
          <div className="w-full mt-12">
            <FileInput
              directory="products"
              onUploadComplete={({ publicURL }) => {
                form.setValue('product.imageURL', publicURL)
              }}
              onUploadDeleted={() => {
                form.setValue('product.imageURL', '')
              }}
              fileTypes={[
                'png',
                'jpeg',
                'jpg',
                'gif',
                'webp',
                'svg',
                'avif',
              ]}
              singleOnly
              initialURL={product.imageURL}
              hint={`The image used on the purchase page. 760 : 420 aspect ratio.`}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
