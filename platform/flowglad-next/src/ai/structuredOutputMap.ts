import { Nouns } from '@/types'
import { productStructuredOutputs } from './structuredOutputs/productStructuredOutputs'
import { priceStructuredOutputs } from './structuredOutputs/priceStructuredOutput'

export const structuredOutputMap = {
  [Nouns.Product]: productStructuredOutputs,
  [Nouns.Price]: priceStructuredOutputs,
} as const
