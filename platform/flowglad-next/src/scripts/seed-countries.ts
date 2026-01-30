#!/usr/bin/env tsx

/**
 * Script to populate the countries table with all ISO 3166-1 alpha-2 country codes and names.
 * This script should be run after setting up a fresh database to ensure the countries table
 * is populated with all necessary country data for the application.
 *
 * Usage:
 *   bunx tsx src/scripts/seed-countries.ts
 *   or
 *   bun run seed:countries
 */

import { CountryCode } from '@db-core/enums'
import { countries } from '@db-core/schema/countries'
import { loadEnvConfig } from '@next/env'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import core from '@/utils/core'
import { countryNameByCountryCode } from '@/utils/countries'
import { logger } from '@/utils/logger'

// Load environment variables
const projectDir = process.cwd()
loadEnvConfig(projectDir)

async function seedCountries() {
  logger.info('🌍 Starting countries table seeding...')

  if (!process.env.VERCEL_GIT_COMMIT_SHA) {
    process.env.VERCEL_GIT_COMMIT_SHA = '__DEV__'
  }

  const dbUrl = core.envVariable('DATABASE_URL')
  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const client = postgres(dbUrl, {
    max: 1,
    idle_timeout: 5,
    prepare: false,
  })

  const db = drizzle(client, { logger: false })

  try {
    const existingCountries = await db
      .select()
      .from(countries)
      .limit(1)

    if (existingCountries.length > 0) {
      logger.info(
        '⚠️  Countries table already contains data. Skipping seeding.'
      )
      logger.info(
        `   Found ${existingCountries.length} existing country record(s).`
      )
      return
    }

    const countryRecords = Object.entries(
      countryNameByCountryCode
    ).map(([code, name]) => ({
      code: code as CountryCode,
      name,
    }))

    logger.info(`📝 Inserting ${countryRecords.length} countries...`)

    const batchSize = 50
    let insertedCount = 0

    for (let i = 0; i < countryRecords.length; i += batchSize) {
      const batch = countryRecords.slice(i, i + batchSize)
      await db.insert(countries).values(batch)
      insertedCount += batch.length
      logger.info(
        `   ✅ Inserted ${insertedCount}/${countryRecords.length} countries`
      )
    }

    // Verify the insertion
    const totalCountries = await db.select().from(countries)
    logger.info(`🎉 Successfully seeded countries table!`)
    logger.info(
      `   Total countries in database: ${totalCountries.length}`
    )

    // Show some examples
    const sampleCountries = totalCountries.slice(0, 5)
    logger.info('   Sample countries:')
    sampleCountries.forEach((country) => {
      logger.info(`     - ${country.name} (${country.code})`)
    })
  } catch (error) {
    logger.error('❌ Error seeding countries table:', { error })
    throw error
  } finally {
    await client.end()
  }
}

if (require.main === module) {
  seedCountries()
    .then(() => {
      logger.info('✅ Countries seeding completed successfully!')
      process.exit(0)
    })
    .catch((error) => {
      logger.error('❌ Countries seeding failed:', { error })
      process.exit(1)
    })
}

export { seedCountries }
