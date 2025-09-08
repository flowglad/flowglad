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
import { snakeCase } from 'change-case'
import { useRef } from 'react'
import { Product } from '@/db/schema/products'

export const ProductFormFields = ({
  editProduct = false,
}: {
  editProduct?: boolean
}) => {
  const form = useFormContext<CreateProductSchema>()
  const product = form.watch('product')
  const isSlugDirty = useRef(false)

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
                      onChange={(e) => {
                        // First, let the field handle its own onChange
                        field.onChange(e)

                        // Then handle our auto-slug logic
                        const newName = e.target.value

                        // Only auto-generate slug if:
                        // 1. We're not editing an existing product
                        // 2. The slug field is not dirty (user hasn't focused it)
                        if (!editProduct && !isSlugDirty.current) {
                          if (newName.trim()) {
                            const newSlug = snakeCase(newName)
                            form.setValue('product.slug', newSlug)
                          } else {
                            form.setValue('product.slug', '')
                          }
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="product.slug"
              render={({ field }) => {
                const { value, ...rest } = field
                return (
                  <FormItem>
                    <FormLabel>Product Slug</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="product_slug"
                        className="w-full"
                        {...rest}
                        value={value || ''}
                        onFocus={() => {
                          isSlugDirty.current = true
                        }}
                        onChange={(e) => {
                          isSlugDirty.current = true
                          field.onChange(e)
                        }}
                      />
                    </FormControl>
                    <FormDescription className="text-xs text-muted-foreground mt-1">
                      Used to identify the product via API. Must be
                      unique per-pricing model.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )
              }}
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
            <div className="w-full mt-4">
              <ProductFeatureMultiSelect
                pricingModelId={product.pricingModelId}
                productId={
                  editProduct
                    ? (product as unknown as Product.ClientUpdate).id
                    : undefined
                }
              />
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
          <div className="w-full mt-8">
            <PriceFormFields edit={editProduct} />
          </div>
          <div className="w-full mt-8">
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
