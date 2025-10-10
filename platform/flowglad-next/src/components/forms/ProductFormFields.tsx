import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'

import FileInput from '@/components/FileInput'
import PriceFormFields from '@/components/forms/PriceFormFields'
import { useFormContext } from 'react-hook-form'
import { CreateProductSchema } from '@/db/schema/prices'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import StatusBadge from '../StatusBadge'
import PricingModelSelect from './PricingModelSelect'
import core from '@/utils/core'
import ProductFeatureMultiSelect from './ProductFeatureMultiSelect'
import { Product } from '@/db/schema/products'
import { AutoSlugInput } from '@/components/fields/AutoSlugInput'
import { useEffect } from 'react'
import { usePriceFormContext } from '@/app/hooks/usePriceFormContext'
import { PriceType } from '@/types'

export const ProductFormFields = ({
  editProduct = false,
}: {
  editProduct?: boolean
}) => {
  const form = useFormContext<CreateProductSchema>()
  const priceForm = usePriceFormContext()
  const product = form.watch('product')
  const priceType = priceForm.watch('price.type')
  const isDefaultProduct = product?.default === true

  // Ensure default products remain active in UI
  useEffect(() => {
    if (isDefaultProduct && product?.active !== true) {
      form.setValue('product.active', true)
    }
  }, [isDefaultProduct, product?.active, form])

  // Clear featureIds when price type is 'usage'
  useEffect(() => {
    if (!editProduct && priceType === PriceType.Usage) {
      form.setValue('featureIds', [])
    }
  }, [priceType, form])

  if (
    !core.IS_PROD &&
    Object.keys(form.formState.errors).length > 0
  ) {
    // eslint-disable-next-line no-console
    console.log('errors', form.formState.errors)
  }
  return (
    <div className="relative flex justify-between items-start gap-2.5 bg-background">
      <div className="flex-1 w-full max-w-[656px] min-w-[460px] relative flex flex-col rounded-lg-md">
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
            {!editProduct && (
              <div className="w-full relative flex flex-col gap-3">
                <PricingModelSelect
                  name="product.pricingModelId"
                  control={form.control}
                />
              </div>
            )}
            <div className="w-full">
              {priceType !== PriceType.Usage && (
                <ProductFeatureMultiSelect
                  pricingModelId={product.pricingModelId}
                  productId={
                    editProduct
                      ? (product as unknown as Product.ClientUpdate)
                          .id
                      : undefined
                  }
                />
              )}
            </div>
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
            )}
          </div>
          <div className="w-full mt-6">
            <PriceFormFields edit={editProduct} />
          </div>
          <div className="w-full mt-6">
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
