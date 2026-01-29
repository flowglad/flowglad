/* eslint-disable no-console */
/*
Patch 1.5: Backfill Unkey Metadata with pricingModelId

Purpose: Update existing API keys' Unkey metadata to include pricingModelId,
so the auth flow can extract it without a database lookup at runtime.

Execution order:
1. Run Patch 1 migration (adds pricingModelId column and backfills in DB)
2. Run this backfill script (updates Unkey metadata)
3. Deploy Patch 2+ code changes

Idempotency: Script can be run multiple times safely - it just overwrites
metadata with the same value.

Run the following in the terminal:
NODE_ENV=production bunx tsx src/scripts/backfillUnkeyPricingModelMetadata.ts
*/

import { and, isNotNull } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import {
  apiKeys,
  secretApiKeyMetadataSchema,
} from '@/db/schema/apiKeys'
import { FlowgladApiKeyType } from '@/types'
import { unkey } from '@/utils/unkey'
import runScript from './scriptRunner'

interface BackfillResult {
  totalKeys: number
  successCount: number
  failureCount: number
  skippedCount: number
  failures: Array<{
    apiKeyId: string
    unkeyId: string
    error: string
  }>
}

async function backfillUnkeyPricingModelMetadata(
  db: PostgresJsDatabase
): Promise<void> {
  console.log(
    'Starting Unkey metadata backfill for pricingModelId...'
  )

  // Query all API keys that have unkeyId (Unkey-managed keys) and pricingModelId
  const keysToUpdate = await db
    .select({
      id: apiKeys.id,
      unkeyId: apiKeys.unkeyId,
      pricingModelId: apiKeys.pricingModelId,
      organizationId: apiKeys.organizationId,
      type: apiKeys.type,
    })
    .from(apiKeys)
    .where(
      and(
        isNotNull(apiKeys.unkeyId),
        isNotNull(apiKeys.pricingModelId)
      )
    )

  console.log(`Found ${keysToUpdate.length} keys to update`)

  const result: BackfillResult = {
    totalKeys: keysToUpdate.length,
    successCount: 0,
    failureCount: 0,
    skippedCount: 0,
    failures: [],
  }

  for (const key of keysToUpdate) {
    if (!key.unkeyId || !key.pricingModelId) {
      console.warn(
        `Skipping key ${key.id}: missing unkeyId or pricingModelId`
      )
      result.skippedCount++
      continue
    }

    // Only process secret keys - publishable keys don't go through Unkey
    if (key.type !== FlowgladApiKeyType.Secret) {
      console.log(
        `Skipping key ${key.id}: not a secret key (type: ${key.type})`
      )
      result.skippedCount++
      continue
    }

    try {
      // First get existing metadata from Unkey
      const existingKeyResponse = await unkey().keys.getKey({
        keyId: key.unkeyId,
      })
      const existingMeta = (existingKeyResponse.data?.meta ?? {}) as {
        [key: string]: unknown
      }

      // Construct the updated metadata with pricingModelId
      const updatedMeta = {
        ...existingMeta,
        pricingModelId: key.pricingModelId,
        // Ensure type is set for legacy keys that may not have it
        type: FlowgladApiKeyType.Secret,
        // Ensure organizationId is set if available
        ...(key.organizationId && {
          organizationId: key.organizationId,
        }),
      }

      // CRITICAL: Parse with the new schema BEFORE updating Unkey
      // This ensures forwards compatibility with the upcoming parser shape.
      // If this parse fails, we don't want to count this as a success because
      // it means the metadata wouldn't pass validation in the auth flow.
      const parseResult =
        secretApiKeyMetadataSchema.safeParse(updatedMeta)

      if (!parseResult.success) {
        const errorMessage = `Schema validation failed: ${parseResult.error.message}`
        console.error(
          `Failed to validate metadata for key ${key.id}:`,
          {
            unkeyId: key.unkeyId,
            existingMeta,
            updatedMeta,
            error: errorMessage,
          }
        )
        result.failureCount++
        result.failures.push({
          apiKeyId: key.id,
          unkeyId: key.unkeyId,
          error: errorMessage,
        })
        continue
      }

      // Schema validation passed - now update Unkey with the validated metadata
      await unkey().keys.updateKey({
        keyId: key.unkeyId,
        meta: parseResult.data,
      })

      result.successCount++
      console.log(`Updated key ${key.id} (${key.unkeyId})`)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      result.failureCount++
      result.failures.push({
        apiKeyId: key.id,
        unkeyId: key.unkeyId!,
        error: errorMessage,
      })
      console.error(`Failed to update key ${key.id}:`, error)
    }
  }

  // Print summary
  console.log('\n========================================')
  console.log('Backfill Complete')
  console.log('========================================')
  console.log(`Total keys found: ${result.totalKeys}`)
  console.log(`Successfully updated: ${result.successCount}`)
  console.log(`Failed: ${result.failureCount}`)
  console.log(`Skipped: ${result.skippedCount}`)

  if (result.failures.length > 0) {
    console.log('\nFailures:')
    result.failures.forEach((failure) => {
      console.log(
        `  - API Key ${failure.apiKeyId} (Unkey: ${failure.unkeyId}): ${failure.error}`
      )
    })
  }

  if (result.failureCount > 0) {
    throw new Error(
      `Backfill completed with ${result.failureCount} failures. Review the errors above.`
    )
  }
}

runScript(backfillUnkeyPricingModelMetadata)
