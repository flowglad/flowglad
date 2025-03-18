import { z } from 'zod'
import { Nouns, Verbs } from '@/types'
import { productsClientSelectSchema } from '@/db/schema/products'
import { pricesClientSelectSchema } from '@/db/schema/prices'
import { classifierSelectionCriteriaFromClientSelectSchema } from '@/db/agentUtils'

const editClassifierSchemaCore = z.object({
  verb: z.literal(Verbs.Edit),
})

const editProductClassifierSchema = editClassifierSchemaCore.extend({
  noun: z.literal(Nouns.Product),
  recordSelectionCriteria:
    classifierSelectionCriteriaFromClientSelectSchema<
      typeof productsClientSelectSchema
    >(productsClientSelectSchema),
})

const editPriceClassifierSchema = editClassifierSchemaCore.extend({
  noun: z.literal(Nouns.Price),
  recordSelectionCriteria:
    classifierSelectionCriteriaFromClientSelectSchema<
      typeof pricesClientSelectSchema
    >(pricesClientSelectSchema),
})

export const editSchema = z.discriminatedUnion('noun', [
  editProductClassifierSchema,
  editPriceClassifierSchema,
])

export type EditClassification = z.infer<typeof editSchema>
