import type { Organization } from '@db-core/schema/organizations'
import type { Webhook } from '@db-core/schema/webhooks'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'
import { insertWebhook } from '@/db/tableMethods/webhookMethods'
import type { DbTransaction } from '@/db/types'
import { panic } from '@/errors'
import {
  createSvixEndpoint,
  findOrCreateSvixApplication,
  getSvixSigningSecret,
} from '@/utils/svix'

interface CreateWebhookTransactionParams {
  webhook: Webhook.ClientInsert
  organization: Organization.Record
  livemode: boolean
  transaction: DbTransaction
}

interface CreateWebhookTransactionResult {
  webhook: Webhook.Record
  secret: string
}

/**
 * Creates a webhook with pricingModelId validation and Svix endpoint setup.
 *
 * This function:
 * 1. Validates that the pricingModelId belongs to the organization and matches livemode
 * 2. Creates/finds the PM-scoped Svix application
 * 3. Inserts the webhook into the database
 * 4. Creates the Svix endpoint
 * 5. Returns the webhook and signing secret
 */
export const createWebhookTransaction = async ({
  webhook: webhookInput,
  organization,
  livemode,
  transaction,
}: CreateWebhookTransactionParams): Promise<CreateWebhookTransactionResult> => {
  // Validate pricingModelId belongs to org and livemode
  const pricingModel = (
    await selectPricingModelById(
      webhookInput.pricingModelId,
      transaction
    )
  ).unwrap()
  if (
    pricingModel.organizationId !== organization.id ||
    pricingModel.livemode !== livemode
  ) {
    panic('Invalid pricing model for this organization and mode')
  }

  // Create PM-scoped Svix app (lazy creation)
  await findOrCreateSvixApplication({
    organization,
    livemode,
    pricingModelId: webhookInput.pricingModelId,
  })

  const webhook = await insertWebhook(
    {
      ...webhookInput,
      organizationId: organization.id,
      livemode,
    },
    transaction
  )

  await createSvixEndpoint({
    webhook,
    organization,
  })

  const secret = await getSvixSigningSecret({
    webhook,
    organization,
  })

  return { webhook, secret: secret.key }
}
