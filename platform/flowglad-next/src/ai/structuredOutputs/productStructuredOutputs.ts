import {
  createGenerateCreateInput,
  createGenerateEditInput,
} from '@/ai/structuredOutputUtils'
import { Product } from '@/db/schema/products'
import {
  CreateProductSchema,
  createProductSchema,
  EditProductInput,
  editProductSchema,
} from '@/db/schema/prices'
import { Verbs } from '@/types'
import { CoreMessage } from 'ai'

export const generateCreateProductInput = createGenerateCreateInput(
  createProductSchema,
  `You are helping a digital seller create a new product to add to their pricing model.
Remember the unitPrice is in Stripe prices for USD - so $1.00 => 100
Also, never make up an imgURL - this will throw an ERROR!
Only add an imageURL if it was provided by the user.

Also - by default make the "offerings" field be an empty array. You shouldn't have any offerings by default.
  `
)

export const generateEditProductInput = createGenerateEditInput<
  Product.Record,
  typeof editProductSchema
>(
  editProductSchema,
  `You are helping a digital seller edit an existing product in their pricing model`
)

interface StructuredOutputCreatorMap {
  [Verbs.Create]: (
    messages: CoreMessage[]
  ) => Promise<CreateProductSchema>
  [Verbs.Edit]: (
    messages: CoreMessage[],
    existingRecord: Product.Record
  ) => Promise<EditProductInput>
}

export const productStructuredOutputs: StructuredOutputCreatorMap = {
  [Verbs.Create]: generateCreateProductInput,
  [Verbs.Edit]: generateEditProductInput,
} as const
