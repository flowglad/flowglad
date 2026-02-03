/**
 * Seeding script for playground projects.
 *
 * This script sets up the platform database (Supabase) with the necessary data
 * for local development of playground projects.
 *
 * Usage:
 *   FORCE_TEST_MODE=1 bun run src/scripts/seedPlayground.ts seat-based-billing
 *
 * The script seeds the platform database (Supabase on port 54322) with:
 *   - A platform user (for logging into the platform dashboard)
 *   - An organization owned by that user
 *   - The pricing model from the playground's pricing.yaml
 *   - An API key scoped to that pricing model
 *
 * Outputs:
 *   - Platform user credentials (email/password) to stdout
 *   - API key token to stdout
 *
 * Note: Playground users sign up normally through Better Auth in the playground app.
 * This script does NOT seed the playground database.
 */

import {
  BusinessOnboardingStatus,
  CountryCode,
  CurrencyCode,
  FlowgladApiKeyType,
  MembershipRole,
  PriceType,
  StripeConnectContractType,
} from '@db-core/enums'
import { type Country, countries } from '@db-core/schema/countries'
import { hashPassword } from 'better-auth/crypto'
import { Result } from 'better-result'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as fs from 'fs'
import * as path from 'path'
import postgres from 'postgres'
import * as yaml from 'yaml'
import { selectCountries } from '@/db/tableMethods/countryMethods'
import { insertOrganization } from '@/db/tableMethods/organizationMethods'
import { createTransactionEffectsContext } from '@/db/types'
import core from '@/utils/core'
import { countryNameByCountryCode } from '@/utils/countries'
import type { SetupPricingModelInput } from '@/utils/pricingModels/setupSchemas'
import { setupPricingModelTransaction } from '@/utils/pricingModels/setupTransaction'

// Hardcoded platform database URL - always use local Supabase
const PLATFORM_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:54322/postgres'

// Platform user configuration - for logging into the Flowglad platform dashboard
const PLATFORM_USER = {
  id: 'platform_user_playground_001',
  email: 'dev@flowglad.local',
  name: 'Playground Developer',
  password: 'flowglad123',
}

const PLATFORM_ORG = {
  name: 'Playground Dev Org',
}

// Available playgrounds
const AVAILABLE_PLAYGROUNDS = [
  'seat-based-billing',
  'generation-based-subscription',
]

/**
 * Transform pricing.yaml format to SetupPricingModelInput format.
 *
 * The YAML format differs from the schema in a few ways:
 * 1. usageMeters in YAML is flat, but schema expects { usageMeter, prices }
 * 2. Products with usage prices should have their prices moved to usageMeters
 */
function transformPricingYaml(
  yamlContent: Record<string, unknown>
): SetupPricingModelInput {
  const rawProducts = (yamlContent.products || []) as Array<{
    product: Record<string, unknown>
    price: Record<string, unknown>
    features: string[]
  }>

  const rawUsageMeters = (yamlContent.usageMeters || []) as Array<{
    name: string
    slug: string
    aggregationType?: string
  }>

  // Build a map of usage meter slugs to their prices
  const usageMeterPrices: Map<
    string,
    Array<Record<string, unknown>>
  > = new Map()
  rawUsageMeters.forEach((meter) => {
    usageMeterPrices.set(meter.slug, [])
  })

  // Filter products: separate regular products from usage-price products
  const regularProducts: typeof rawProducts = []
  for (const product of rawProducts) {
    if (product.price.type === PriceType.Usage) {
      // Move usage price to the corresponding usage meter
      const meterSlug = product.price.usageMeterSlug as string
      if (meterSlug && usageMeterPrices.has(meterSlug)) {
        const prices = usageMeterPrices.get(meterSlug)!
        prices.push({
          type: PriceType.Usage, // Required by the schema
          name: product.price.name,
          slug: product.price.slug,
          unitPrice: product.price.unitPrice,
          usageEventsPerUnit: product.price.usageEventsPerUnit,
          isDefault: product.price.isDefault,
          active: product.price.active,
          intervalUnit: product.price.intervalUnit,
          intervalCount: product.price.intervalCount,
        })
      }
      // Skip adding this product to regularProducts
    } else {
      regularProducts.push(product)
    }
  }

  // Transform usage meters to the expected schema format
  const transformedUsageMeters = rawUsageMeters.map((meter) => ({
    usageMeter: {
      name: meter.name,
      slug: meter.slug,
      ...(meter.aggregationType && {
        aggregationType: meter.aggregationType,
      }),
    },
    prices: usageMeterPrices.get(meter.slug) || [],
  }))

  return {
    name: yamlContent.name as string,
    isDefault: true, // Always set to true for playground seeding
    features: (yamlContent.features ||
      []) as SetupPricingModelInput['features'],
    products: regularProducts as SetupPricingModelInput['products'],
    usageMeters:
      transformedUsageMeters as SetupPricingModelInput['usageMeters'],
    resources: (yamlContent.resources ||
      []) as SetupPricingModelInput['resources'],
  }
}

/**
 * Load and parse pricing.yaml from a playground directory.
 */
function loadPricingYaml(
  playgroundName: string
): SetupPricingModelInput {
  // From src/scripts -> src -> flowglad-next -> platform -> repo root
  const repoRoot = path.resolve(__dirname, '../../../..')
  const pricingYamlPath = path.join(
    repoRoot,
    'playground',
    playgroundName,
    'pricing.yaml'
  )

  if (!fs.existsSync(pricingYamlPath)) {
    throw new Error(`pricing.yaml not found at ${pricingYamlPath}`)
  }

  const yamlContent = yaml.parse(
    fs.readFileSync(pricingYamlPath, 'utf-8')
  )
  return transformPricingYaml(yamlContent)
}

/**
 * Seed the platform database (Supabase).
 * Creates a loginable platform user, organization, pricing model, and API key.
 *
 * Uses its own database connection to ensure it connects to local Supabase
 * regardless of environment variables.
 */
async function seedPlatformDatabase(
  pricingModelInput: SetupPricingModelInput
): Promise<{
  organizationId: string
  pricingModelId: string
  apiKeyToken: string
}> {
  // eslint-disable-next-line no-console
  console.log(
    `Seeding platform database at ${PLATFORM_DATABASE_URL}...`
  )

  // Create our own database connection with the hardcoded URL
  const client = postgres(PLATFORM_DATABASE_URL, {
    max: 5,
    idle_timeout: 5,
    prepare: false,
  })
  const db = drizzle(client)

  try {
    // Hash the platform user password
    const hashedPassword = await hashPassword(PLATFORM_USER.password)

    // Run everything in a transaction
    const result = await db.transaction(async (transaction) => {
      const cacheRecomputationContext = {
        type: 'admin' as const,
        livemode: false,
      }

      const ctx = createTransactionEffectsContext(
        transaction,
        cacheRecomputationContext
      )

      // Seed countries first (idempotent - uses ON CONFLICT DO NOTHING)
      const countryInserts: Country.Insert[] = Object.entries(
        countryNameByCountryCode
      ).map(([code, name]) => ({
        code: code as CountryCode,
        name,
      }))
      await transaction
        .insert(countries)
        .values(countryInserts)
        .onConflictDoNothing()

      // eslint-disable-next-line no-console
      console.log('Seeded countries')

      // Get US country for organization
      const [country] = await selectCountries(
        { code: CountryCode.US },
        transaction
      )

      if (!country) {
        throw new Error('US country not found after seeding.')
      }

      const now = new Date().toISOString()

      // Create Better Auth user (for login)
      // Use ON CONFLICT to make this idempotent
      await transaction.execute(sql`
        INSERT INTO better_auth_user (
          id, name, email, email_verified, role, created_at, updated_at
        ) VALUES (
          ${PLATFORM_USER.id},
          ${PLATFORM_USER.name},
          ${PLATFORM_USER.email},
          ${true},
          ${'user'},
          ${now}::timestamptz,
          ${now}::timestamptz
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          updated_at = ${now}::timestamptz
      `)

      // eslint-disable-next-line no-console
      console.log(`Created Better Auth user: ${PLATFORM_USER.email}`)

      // Create Better Auth account with credential provider (for password login)
      const accountId = `account_${PLATFORM_USER.id}`
      await transaction.execute(sql`
        INSERT INTO better_auth_account (
          id, account_id, provider_id, user_id, password, created_at, updated_at
        ) VALUES (
          ${accountId},
          ${PLATFORM_USER.email},
          ${'credential'},
          ${PLATFORM_USER.id},
          ${hashedPassword},
          ${now}::timestamptz,
          ${now}::timestamptz
        )
        ON CONFLICT (id) DO UPDATE SET
          password = EXCLUDED.password,
          updated_at = ${now}::timestamptz
      `)

      // eslint-disable-next-line no-console
      console.log('Created Better Auth account with password')

      // Create platform user record (linked to Better Auth user)
      // Use raw SQL for idempotency - insertUser doesn't support upsert
      await transaction.execute(sql`
        INSERT INTO users (
          id, name, email, better_auth_id
        ) VALUES (
          ${PLATFORM_USER.id},
          ${PLATFORM_USER.name},
          ${PLATFORM_USER.email},
          ${PLATFORM_USER.id}
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          better_auth_id = EXCLUDED.better_auth_id
      `)

      // eslint-disable-next-line no-console
      console.log(`Created platform user: ${PLATFORM_USER.id}`)

      // Create organization
      const organization = await insertOrganization(
        {
          name: PLATFORM_ORG.name,
          countryId: country.id,
          defaultCurrency: CurrencyCode.USD,
          onboardingStatus: BusinessOnboardingStatus.FullyOnboarded,
          stripeConnectContractType:
            StripeConnectContractType.Platform,
          featureFlags: {},
          contactEmail: PLATFORM_USER.email,
          billingAddress: {
            address: {
              line1: '123 Dev Street',
              city: 'San Francisco',
              state: 'CA',
              postal_code: '94102',
              country: 'US',
            },
          },
          payoutsEnabled: true,
          stripeAccountId: `acct_test_${core.nanoid()}`,
        },
        transaction
      )

      // eslint-disable-next-line no-console
      console.log(`Created organization: ${organization.id}`)

      // Setup pricing model from pricing.yaml BEFORE membership
      // (membership requires focusedPricingModelId)
      const pricingModelResult = await setupPricingModelTransaction(
        {
          input: pricingModelInput,
          organizationId: organization.id,
          livemode: false,
        },
        ctx
      )

      if (Result.isError(pricingModelResult)) {
        throw pricingModelResult.error
      }

      const { pricingModel } = pricingModelResult.value

      // eslint-disable-next-line no-console
      console.log(`Created pricing model: ${pricingModel.id}`)

      // Create membership for the platform user
      // Use raw SQL because the database has a focused_pricing_model_id NOT NULL constraint
      // that isn't in the Drizzle schema yet
      const membershipId = `memb_${core.nanoid()}`
      await transaction.execute(sql`
        INSERT INTO memberships (
          id, organization_id, user_id, focused, livemode, role, focused_pricing_model_id
        ) VALUES (
          ${membershipId},
          ${organization.id},
          ${PLATFORM_USER.id},
          ${true},
          ${false},
          ${MembershipRole.Owner},
          ${pricingModel.id}
        )
      `)

      // eslint-disable-next-line no-console
      console.log(`Created membership: ${membershipId}`)

      // Create API key for the pricing model directly (bypass Unkey for local seeding)
      // Generate a mock API key token that looks like a real one
      const pmIdSuffix = pricingModel.id
        .replace('pricing_model_', '')
        .slice(0, 4)
      const apiKeyId = `apikey_${core.nanoid()}`
      const apiKeyToken = `sk_test_${pmIdSuffix}_${core.nanoid()}`

      await transaction.execute(sql`
        INSERT INTO api_keys (
          id, organization_id, pricing_model_id, name, token, active, type, livemode
        ) VALUES (
          ${apiKeyId},
          ${organization.id},
          ${pricingModel.id},
          ${'Playground Secret Key'},
          ${apiKeyToken},
          ${true},
          ${FlowgladApiKeyType.Secret},
          ${false}
        )
      `)

      // eslint-disable-next-line no-console
      console.log(`Created API key: ${apiKeyId}`)

      return {
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        apiKeyToken,
      }
    })

    return result
  } finally {
    await client.end()
  }
}

/**
 * Main function to run the seeding script.
 */
async function main() {
  const args = process.argv.slice(2)
  const playgroundName = args[0]

  if (!playgroundName) {
    // eslint-disable-next-line no-console
    console.error(
      'Usage: bun run src/scripts/seedPlayground.ts <playground-name>'
    )
    // eslint-disable-next-line no-console
    console.error(
      `Available playgrounds: ${AVAILABLE_PLAYGROUNDS.join(', ')}`
    )
    process.exit(1)
  }

  if (!AVAILABLE_PLAYGROUNDS.includes(playgroundName)) {
    // eslint-disable-next-line no-console
    console.error(`Unknown playground: ${playgroundName}`)
    // eslint-disable-next-line no-console
    console.error(
      `Available playgrounds: ${AVAILABLE_PLAYGROUNDS.join(', ')}`
    )
    process.exit(1)
  }

  // Verify FORCE_TEST_MODE is set
  if (process.env.FORCE_TEST_MODE !== '1') {
    // eslint-disable-next-line no-console
    console.error(
      'Error: FORCE_TEST_MODE=1 must be set to run this script'
    )
    process.exit(1)
  }

  try {
    // Load pricing.yaml
    const pricingModelInput = loadPricingYaml(playgroundName)
    // eslint-disable-next-line no-console
    console.log(
      `Loaded pricing.yaml for ${playgroundName}: "${pricingModelInput.name}"`
    )

    // Seed platform database
    const { organizationId, pricingModelId, apiKeyToken } =
      await seedPlatformDatabase(pricingModelInput)

    // Output summary
    // eslint-disable-next-line no-console
    console.log('\n' + '='.repeat(60))
    // eslint-disable-next-line no-console
    console.log('Seeding completed successfully!')
    // eslint-disable-next-line no-console
    console.log('='.repeat(60))
    // eslint-disable-next-line no-console
    console.log('\nPlatform Database:')
    // eslint-disable-next-line no-console
    console.log(`  Organization ID: ${organizationId}`)
    // eslint-disable-next-line no-console
    console.log(`  Pricing Model ID: ${pricingModelId}`)
    // eslint-disable-next-line no-console
    console.log('\nPlatform Login Credentials:')
    // eslint-disable-next-line no-console
    console.log(`  Email: ${PLATFORM_USER.email}`)
    // eslint-disable-next-line no-console
    console.log(`  Password: ${PLATFORM_USER.password}`)
    // eslint-disable-next-line no-console
    console.log('\nAPI Key (save this - shown only once):')
    // eslint-disable-next-line no-console
    console.log(`  FLOWGLAD_SECRET_KEY=${apiKeyToken}`)
    // eslint-disable-next-line no-console
    console.log('\n' + '='.repeat(60))

    process.exit(0)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error seeding database:', error)
    process.exit(1)
  }
}

main()
