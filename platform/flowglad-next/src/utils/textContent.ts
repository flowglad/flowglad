import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectOrganizationById,
  updateOrganization,
} from '@/db/tableMethods/organizationMethods'
import {
  selectPricingModelById,
  updatePricingModel,
} from '@/db/tableMethods/pricingModelMethods'
import {
  generateContentHash,
  getMarkdownFile,
  putMarkdownFile,
} from './cloudflare'

/**
 * Saves organization codebase markdown to Cloudflare R2 and stores the hash in database
 * Handles fetching the organization's securitySalt from the database
 */
export const saveOrganizationCodebaseMarkdown = async ({
  organizationId,
  markdown,
}: {
  organizationId: string
  markdown: string
}): Promise<void> => {
  // Fetch organization to get securitySalt
  const orgResult = await adminTransaction(
    async ({ transaction }) => {
      return Result.ok(
        (
          await selectOrganizationById(organizationId, transaction)
        ).unwrap()
      )
    }
  )
  const organization = orgResult.unwrap()

  // Generate content hash using organization's securitySalt
  const contentHash = generateContentHash({
    content: markdown,
    securitySalt: organization.securitySalt,
  })

  const key = `codebase-${contentHash}.md`

  // Store the file in Cloudflare R2 first to ensure it exists before updating the database
  await putMarkdownFile({
    organizationId,
    key,
    markdown,
  })

  // Store hash in database after successful R2 upload
  await adminTransaction(async ({ transaction }) => {
    await updateOrganization(
      {
        id: organizationId,
        codebaseMarkdownHash: contentHash,
      },
      transaction
    )
    return Result.ok(undefined)
  })
}

/**
 * Retrieves organization codebase markdown from Cloudflare R2
 * Retrieves hash from organizations.codebaseMarkdownHash (database)
 */
export const getOrganizationCodebaseMarkdown = async (
  organizationId: string
): Promise<string | null> => {
  // Fetch hash from database
  const orgResult = await adminTransaction(
    async ({ transaction }) => {
      return Result.ok(
        (
          await selectOrganizationById(organizationId, transaction)
        ).unwrap()
      )
    }
  )
  const organization = orgResult.unwrap()

  const contentHash = organization.codebaseMarkdownHash ?? null
  if (!contentHash) {
    return null
  }

  const key = `codebase-${contentHash}.md`

  // Retrieve the file from Cloudflare R2
  return getMarkdownFile({
    organizationId,
    key,
  })
}

/**
 * Saves pricing model integration guide markdown to Cloudflare R2 and stores the hash in database
 * Handles fetching the organization's securitySalt from the database
 */
export const savePricingModelIntegrationMarkdown = async ({
  organizationId,
  pricingModelId,
  markdown,
}: {
  organizationId: string
  pricingModelId: string
  markdown: string
}): Promise<void> => {
  // Fetch organization to get securitySalt
  const orgResult = await adminTransaction(
    async ({ transaction }) => {
      return Result.ok(
        (
          await selectOrganizationById(organizationId, transaction)
        ).unwrap()
      )
    }
  )
  const organization = orgResult.unwrap()

  // Generate content hash using organization's securitySalt
  const contentHash = generateContentHash({
    content: markdown,
    securitySalt: organization.securitySalt,
  })

  const key = `pricing-models/${pricingModelId}/integration-guide-${contentHash}.md`

  // Store the file in Cloudflare R2 first to ensure it exists before updating the database
  await putMarkdownFile({
    organizationId,
    key,
    markdown,
  })

  // Store hash in database after successful R2 upload
  await adminTransaction(
    async ({
      transaction,
      cacheRecomputationContext,
      invalidateCache,
      emitEvent,
      enqueueLedgerCommand,
    }) => {
      await updatePricingModel(
        {
          id: pricingModelId,
          integrationGuideHash: contentHash,
        },
        {
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }
      )
      return Result.ok(undefined)
    }
  )
}

/**
 * Retrieves pricing model integration guide markdown from Cloudflare R2
 * Retrieves hash from pricing_models.integrationGuideHash (database)
 */
export const getPricingModelIntegrationMarkdown = async ({
  organizationId,
  pricingModelId,
}: {
  organizationId: string
  pricingModelId: string
}): Promise<string | null> => {
  // Fetch hash from database
  const pricingModelResult = await adminTransaction(
    async ({ transaction }) => {
      const innerResult = await selectPricingModelById(
        pricingModelId,
        transaction
      )
      if (Result.isError(innerResult)) {
        return Result.ok(null)
      }
      return Result.ok(innerResult.value)
    }
  )
  const pricingModel = pricingModelResult.unwrap()

  const contentHash = pricingModel?.integrationGuideHash ?? null
  if (!contentHash) {
    return null
  }

  const key = `pricing-models/${pricingModelId}/integration-guide-${contentHash}.md`

  // Retrieve the file from Cloudflare R2
  return getMarkdownFile({
    organizationId,
    key,
  })
}

export const fetchMarkdownFromDocs = async (
  path: string
): Promise<string | null> => {
  // Convert .mdx to .md for the URL
  const urlPath = path.endsWith('.mdx')
    ? path.slice(0, -1) // Remove 'x' from .mdx to make it .md
    : path

  const url = `https://docs.flowglad.com/${urlPath}`

  try {
    const response = await fetch(url)
    if (response.ok) {
      return await response.text()
    } else {
      console.warn(
        `Could not fetch markdown file from ${url}: ${response.status} ${response.statusText}`
      )
      return null
    }
  } catch (error) {
    // File might not exist or there was a network error
    console.warn(`Could not fetch markdown file from ${url}:`, error)
    return null
  }
}
