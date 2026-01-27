/**
 * Register a sync webhook URL for an API key scope.
 *
 * Usage:
 *   bun run register-sync-webhook <api-key> <webhook-url> [--regenerate-secret]
 *
 * Examples:
 *   bun run register-sync-webhook sk_test_abc123 https://example.com/webhook
 *   bun run register-sync-webhook sk_live_xyz789 https://myapp.com/api/sync --regenerate-secret
 *
 * The script will:
 * 1. Verify the API key via Unkey
 * 2. Validate the webhook URL
 * 3. Generate a signing secret (or preserve existing one)
 * 4. Store the configuration in Redis
 * 5. Output the signing secret (save it securely!)
 *
 * Requires environment variables:
 *   - UNKEY_ROOT_KEY
 *   - UPSTASH_REDIS_REST_URL
 *   - UPSTASH_REDIS_REST_TOKEN
 */

import core from '@/utils/core'
import { validateWebhookUrl } from '@/utils/syncWebhook'
import {
  buildScopeId,
  getSyncWebhookConfig,
  registerSyncWebhook,
} from '@/utils/syncWebhookConfig'
import { verifyApiKey } from '@/utils/unkey'

interface ParsedArgs {
  apiKey: string
  webhookUrl: string
  regenerateSecret: boolean
}

function printUsage(): void {
  console.log(`
Usage: bun run register-sync-webhook <api-key> <webhook-url> [options]

Arguments:
  api-key      The Flowglad API key (e.g., sk_test_abc123 or sk_live_xyz789)
  webhook-url  The HTTPS URL to receive sync notifications

Options:
  --regenerate-secret  Generate a new signing secret even if one exists
  --help               Show this help message

Examples:
  bun run register-sync-webhook sk_test_abc123 https://example.com/webhook
  bun run register-sync-webhook sk_live_xyz789 https://myapp.com/api/sync --regenerate-secret
`)
}

function parseArgs(): ParsedArgs | null {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    printUsage()
    return null
  }

  const positionalArgs = args.filter((arg) => !arg.startsWith('--'))
  const flags = args.filter((arg) => arg.startsWith('--'))

  if (positionalArgs.length < 2) {
    console.error('Error: Missing required arguments.\n')
    printUsage()
    return null
  }

  return {
    apiKey: positionalArgs[0],
    webhookUrl: positionalArgs[1],
    regenerateSecret: flags.includes('--regenerate-secret'),
  }
}

async function main(): Promise<void> {
  const args = parseArgs()
  if (!args) {
    process.exit(1)
  }

  const { apiKey, webhookUrl, regenerateSecret } = args

  console.log('\n🔗 Registering Sync Webhook\n')

  // Step 1: Verify the API key
  console.log('1. Verifying API key...')
  const keyPrefix = apiKey.substring(0, 12)
  console.log(`   Key prefix: ${keyPrefix}...`)

  let verificationResult
  try {
    verificationResult = await verifyApiKey(apiKey)
  } catch (error) {
    console.error(
      '   ❌ Failed to verify API key:',
      error instanceof Error ? error.message : error
    )
    process.exit(1)
  }

  if (!verificationResult.result?.valid) {
    console.error('   ❌ API key is invalid')
    console.error(
      `   Code: ${verificationResult.result?.code || 'UNKNOWN'}`
    )
    process.exit(1)
  }

  const ownerId = verificationResult.result.ownerId
  const environment = verificationResult.result.environment

  if (!ownerId) {
    console.error('   ❌ API key has no owner ID (organization)')
    process.exit(1)
  }

  const livemode = environment === 'live'
  console.log(`   ✅ API key verified`)
  console.log(`   Organization ID: ${ownerId}`)
  console.log(`   Environment: ${environment}\n`)

  // Step 2: Validate the webhook URL
  console.log('2. Validating webhook URL...')
  const isProduction = livemode || core.IS_PROD

  const validation = validateWebhookUrl(webhookUrl, isProduction)
  if (!validation.valid) {
    console.error(`   ❌ ${validation.error}`)
    process.exit(1)
  }
  console.log(`   ✅ URL is valid: ${webhookUrl}\n`)

  // Step 3: Build scope ID and register webhook
  const scopeId = buildScopeId(ownerId, livemode)
  console.log('3. Registering webhook...')
  console.log(`   Scope ID: ${scopeId}`)

  // Check for existing config
  const existing = await getSyncWebhookConfig(scopeId)
  if (existing) {
    console.log(`   Found existing webhook config`)
    if (regenerateSecret) {
      console.log(
        `   --regenerate-secret flag set, will create new secret`
      )
    } else {
      console.log(`   Preserving existing signing secret`)
    }
  }

  const { config, isNew } = await registerSyncWebhook({
    scopeId,
    url: webhookUrl,
    regenerateSecret,
  })

  console.log(`   ✅ Webhook ${isNew ? 'created' : 'updated'}\n`)

  // Step 4: Output the results
  console.log('═'.repeat(60))
  console.log('  SYNC WEBHOOK CONFIGURATION')
  console.log('═'.repeat(60))
  console.log(`  Scope ID:      ${scopeId}`)
  console.log(`  Webhook URL:   ${config.url}`)
  console.log(`  Active:        ${config.active}`)
  console.log(`  Created:       ${config.createdAt}`)
  console.log(`  Updated:       ${config.updatedAt}`)
  console.log('─'.repeat(60))
  console.log('  SIGNING SECRET (save this securely!)')
  console.log('─'.repeat(60))
  console.log(`  ${config.secret}`)
  console.log('═'.repeat(60))

  if (isNew || regenerateSecret) {
    console.log('\n⚠️  IMPORTANT: Save the signing secret above!')
    console.log('   This secret will NOT be shown again.')
    console.log(
      '   Use it to verify incoming webhook signatures with verifyWebhookSignature().\n'
    )
  }

  console.log('✅ Done!\n')
}

main().catch((error) => {
  console.error('Script failed:', error)
  process.exit(1)
})
