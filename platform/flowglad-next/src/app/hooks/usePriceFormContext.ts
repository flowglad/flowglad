import { useFormContext } from 'react-hook-form'
import { CreateProductSchema } from '@/db/schema/prices'

export const usePriceFormContext = () => {
  return useFormContext<Pick<CreateProductSchema, 'price'>>()
}
