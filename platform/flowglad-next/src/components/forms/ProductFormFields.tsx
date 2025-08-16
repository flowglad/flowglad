import Input from '@/components/ion/Input'
import Label from '@/components/ion/Label'
import Textarea from '@/components/ion/Textarea'
import FileInput from '@/components/FileInput'
import PriceFormFields from '@/components/forms/PriceFormFields'
import { Controller, useFormContext } from 'react-hook-form'
import { CreateProductSchema } from '@/db/schema/prices'
import Switch from '../ion/Switch'
import StatusBadge from '../StatusBadge'
import { Accordion } from '../ion/Accordion'
import AIHoverModal from './AIHoverModal'
import CatalogSelect from './CatalogSelect'
import core from '@/utils/core'
import ProductFeatureMultiSelect from './ProductFeatureMultiSelect'

export const ProductFormFields = ({
  editProduct = false,
}: {
  editProduct?: boolean
}) => {
  const {
    register,
    formState: { errors },
    setValue,
    watch,
    control,
  } = useFormContext<CreateProductSchema>()
  const product = watch('product')
  if (!core.IS_PROD && Object.keys(errors).length > 0) {
    // eslint-disable-next-line no-console
    console.log('errors', errors)
  }
  return (
    <div className="relative flex justify-between items-start gap-2.5 bg-background">
      <div className="flex-1 w-full max-w-[656px] min-w-[460px] relative flex flex-col rounded-radius-md">
        <div className="w-full relative flex flex-col items-start">
          <div className="flex-1 w-full relative flex flex-col justify-center gap-6">
            <Input
              placeholder="Product"
              label="Name"
              {...register('product.name')}
              className="w-full"
              error={errors.product?.name?.message}
            />
            <Input
              placeholder="product_slug"
              label="Product Slug"
              {...register('product.slug')}
              hint="Used to identify the product in its catalog. Must be unique per-catalog."
              className="w-full"
              error={errors.product?.slug?.message}
            />
            <Textarea
              placeholder="Product description"
              label="Description"
              className="w-full"
              {...register('product.description')}
              error={errors.product?.description?.message}
              rightLabelElement={
                <AIHoverModal
                  productName={product.name}
                  triggerLabel="Generate"
                  onGenerateComplete={(result) => {
                    setValue('product.description', result)
                  }}
                />
              }
              hint="Details about your product that will be displayed on the purchase page."
            />
            {!editProduct && (
              <div className="w-full relative flex flex-col gap-3">
                <CatalogSelect
                  name="product.catalogId"
                  control={control}
                />
              </div>
            )}
            <div className="w-full mt-4">
              <ProductFeatureMultiSelect
                catalogId={product.catalogId}
              />
            </div>
            {editProduct && (
              <div className="w-full relative flex flex-col gap-3">
                <Label>Status</Label>
                <Controller
                  name="product.active"
                  render={({ field }) => (
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      label={
                        <div className="cursor-pointer w-full">
                          {field.value ? (
                            <StatusBadge active={true} />
                          ) : (
                            <StatusBadge active={false} />
                          )}
                        </div>
                      }
                    />
                  )}
                />
              </div>
            )}
          </div>
          <div className="w-full mt-8">
            <PriceFormFields edit={editProduct} />
          </div>
          <div className="w-full mt-8">
            <FileInput
              directory="products"
              onUploadComplete={({ publicURL }) => {
                setValue('product.imageURL', publicURL)
              }}
              onUploadDeleted={() => {
                setValue('product.imageURL', '')
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
