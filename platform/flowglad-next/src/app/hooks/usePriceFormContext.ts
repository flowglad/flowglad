import { useFormContext } from 'react-hook-form'
import { CreateProductFormSchema } from '@/db/schema/prices'

export const usePriceFormContext = () => {
  return useFormContext<
    Pick<CreateProductFormSchema, 'price' | '__rawPriceString'>
  >()
}
