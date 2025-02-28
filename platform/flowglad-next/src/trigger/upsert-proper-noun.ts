import { adminTransaction } from '@/db/databaseMethods'
import { CustomerProfile } from '@/db/schema/customerProfiles'
import { Product } from '@/db/schema/products'
import {
  ProperNoun,
  properNounSupabaseWebhookInsertPayloadSchema,
  properNounSupabaseWebhookUpdatePayloadSchema,
} from '@/db/schema/properNouns'
import { Variant } from '@/db/schema/variants'
import { upsertProperNounByEntityId } from '@/db/tableMethods/properNounMethods'
import { selectVariantProductAndOrganizationByVariantWhere } from '@/db/tableMethods/variantMethods'
import {
  SupabaseInsertPayload,
  SupabasePayloadType,
  SupabaseUpdatePayload,
} from '@/types'
import {
  customerProfileToProperNounUpsert,
  productRecordToProperNounUpsert,
  supabasePayloadToProperNounUpsert,
  variantRecordToProperNounUpsert,
} from '@/utils/properNounHelpers'
import { logger, task } from '@trigger.dev/sdk/v3'
import { z } from 'zod'

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
        await selectVariantProductAndOrganizationByVariantWhere(
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
