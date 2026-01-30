import type { CreateProductFormSchema } from '@db-core/schema/prices'
import { useFormContext } from 'react-hook-form'

export const usePriceFormContext = () => {
  return useFormContext<
    Pick<CreateProductFormSchema, 'price' | '__rawPriceString'>
  >()
}
