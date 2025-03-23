import { adminTransaction } from '@/db/databaseMethods'
import {
  customersSupabaseInsertPayloadSchema,
  customersSupabaseUpdatePayloadSchema,
} from '@/db/schema/customers'
import {
  productsSupabaseInsertPayloadSchema,
  productsSupabaseUpdatePayloadSchema,
} from '@/db/schema/products'
import {
  pricesSupabaseInsertPayloadSchema,
  pricesSupabaseUpdatePayloadSchema,
} from '@/db/schema/prices'
import { upsertProperNounByEntityId } from '@/db/tableMethods/properNounMethods'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import {
  SupabaseInsertPayload,
  SupabasePayloadType,
  SupabaseUpdatePayload,
} from '@/types'
import {
  customerToProperNounUpsert,
  productRecordToProperNounUpsert,
  supabasePayloadToProperNounUpsert,
  variantRecordToProperNounUpsert,
} from '@/utils/properNounHelpers'
import { logger, task } from '@trigger.dev/sdk/v3'
import { z } from 'zod'
import {
  discountsSupabaseInsertPayloadSchema,
  discountsSupabaseUpdatePayloadSchema,
} from '@/db/schema/discounts'

const properNounSupabaseWebhookUpdatePayloadSchema =
  z.discriminatedUnion('table', [
    productsSupabaseUpdatePayloadSchema.extend({
      table: z.literal('products'),
    }),
    pricesSupabaseUpdatePayloadSchema.extend({
      table: z.literal('prices'),
    }),
    customersSupabaseUpdatePayloadSchema.extend({
      table: z.literal('customers'),
    }),
    discountsSupabaseUpdatePayloadSchema.extend({
      table: z.literal('discounts'),
    }),
  ])

const properNounSupabaseWebhookInsertPayloadSchema =
  z.discriminatedUnion('table', [
    productsSupabaseInsertPayloadSchema.extend({
      table: z.literal('products'),
    }),
    pricesSupabaseInsertPayloadSchema.extend({
      table: z.literal('prices'),
    }),
    customersSupabaseInsertPayloadSchema.extend({
      table: z.literal('customers'),
    }),
    discountsSupabaseInsertPayloadSchema.extend({
      table: z.literal('discounts'),
    }),
  ])

export const upsertProperNounTask = task({
  id: 'upsert-proper-noun',
  run: async (
    payload:
      | z.infer<typeof properNounSupabaseWebhookUpdatePayloadSchema>
      | z.infer<typeof properNounSupabaseWebhookInsertPayloadSchema>,
    { ctx }
  ) => {
    const parsedPayload =
      payload.type === SupabasePayloadType.UPDATE
        ? properNounSupabaseWebhookUpdatePayloadSchema.safeParse(
            payload
          )
        : properNounSupabaseWebhookInsertPayloadSchema.safeParse(
            payload
          )

    if (!parsedPayload.success) {
      logger.error(parsedPayload.error.message)
      parsedPayload.error.issues.forEach((issue) => {
        logger.error(`${issue.path.join('.')}: ${issue.message}`)
      })
      throw new Error('Invalid payload')
    }

    const data = parsedPayload.data

    await adminTransaction(async ({ transaction }) => {
      const [{ organization }] =
        await selectPriceProductAndOrganizationByPriceWhere(
          {
            id: data.record.id,
          },
          transaction
        )
      const properNounUpsert =
        await supabasePayloadToProperNounUpsert(
          data as SupabaseInsertPayload | SupabaseUpdatePayload,
          organization.id
        )
      return upsertProperNounByEntityId(properNounUpsert, transaction)
    })

    return {
      message: 'Hello, world!',
    }
  },
})
