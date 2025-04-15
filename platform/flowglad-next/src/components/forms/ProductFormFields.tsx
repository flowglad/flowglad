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
  return (
    <div className="relative flex justify-between items-center gap-2.5 bg-background">
      <div className="flex-1 w-full max-w-[656px] min-w-[460px] relative flex flex-col rounded-radius-md">
        <div className="w-full relative flex items-start">
          <Accordion
            type="multiple"
            defaultValue={[
              'general',
              'pricing',
              'thumbnail',
              'offerings',
            ]}
            items={[
              {
                value: 'general',
                header: <div>General</div>,
                content: (
                  <div className="flex-1 w-full relative flex flex-col justify-center gap-6">
                    <Input
                      placeholder="Product"
                      label="Name"
                      {...register('product.name')}
                      className="w-full"
                      error={errors.product?.name?.message}
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
                ),
              },
              {
                value: 'pricing',
                header: <div>Pricing</div>,
                content: <PriceFormFields edit={editProduct} />,
              },
              {
                value: 'thumbnail',
                header: <div>Thumbnail</div>,
                content: (
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
                ),
              },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
