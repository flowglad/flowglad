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
import StatusBadge from '../StatusBadge'
import { Accordion } from '../ion/Accordion'
import AIHoverModal from './AIHoverModal'
import CatalogSelect from './CatalogSelect'
import core from '@/utils/core'

export const ProductFormFields = ({
  editProduct = false,
}: {
  editProduct?: boolean
}) => {
  const form = useFormContext<CreateProductSchema>()
  const product = form.watch('product')
  if (!core.IS_PROD && Object.keys(form.formState.errors).length > 0) {
    // eslint-disable-next-line no-console
    console.log('errors', form.formState.errors)
  }
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
                      name="product.description"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>Description</FormLabel>
                            <AIHoverModal
                              productName={product.name}
                              triggerLabel="Generate"
                              onGenerateComplete={(result) => {
                                form.setValue('product.description', result)
                              }}
                            />
                          </div>
                          <FormControl>
                            <Textarea
                              placeholder="Product description"
                              className="w-full"
                              {...field}
                              value={field.value || ''}
                            />
                          </FormControl>
                          <FormDescription>
                            Details about your product that will be displayed on the purchase page.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {!editProduct && (
                      <div className="w-full relative flex flex-col gap-3">
                        <CatalogSelect
                          name="product.catalogId"
                          control={form.control}
                        />
                      </div>
                    )}
                    {editProduct && (
                      <FormField
                        control={form.control}
                        name="product.active"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Status</FormLabel>
                            <FormControl>
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
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
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
                ),
              },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
