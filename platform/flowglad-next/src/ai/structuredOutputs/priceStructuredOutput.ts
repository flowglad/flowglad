import {
  CreatePriceInput,
  createPriceSchema,
  EditPriceInput,
  editPriceSchema,
  Price,
} from '@/db/schema/prices'
import {
  createGenerateCreateInput,
  createGenerateEditInput,
} from '@/ai/structuredOutputUtils'
import { Verbs } from '@/types'
import { CoreMessage } from 'ai'

export const generateCreatePriceInput = createGenerateCreateInput(
  createPriceSchema,
  `You are helping a digital seller create a new price to add to their product.
  Remember the unitPrice is in Stripe prices for USD - so $1.00 => 100
  Also, never make up an imgURL - this will throw an ERROR!
  Only add an imageURL if it was provided by the user.
    `
)

export const generateEditPriceInput = createGenerateEditInput<
  Price.Record,
  typeof editPriceSchema
>(
  editPriceSchema,
  `You are helping a digital seller edit an existing price in their product`
)

interface StructuredOutputCreatorMap {
  [Verbs.Create]: (
    messages: CoreMessage[]
  ) => Promise<CreatePriceInput>
  [Verbs.Edit]: (
    messages: CoreMessage[],
    existingRecord: Price.Record
  ) => Promise<EditPriceInput>
}

export const priceStructuredOutputs: StructuredOutputCreatorMap = {
  [Verbs.Create]: generateCreatePriceInput,
  [Verbs.Edit]: generateEditPriceInput,
} as const
