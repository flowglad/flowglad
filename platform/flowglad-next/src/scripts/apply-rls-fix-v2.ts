import { loadEnvConfig } from '@next/env'
import postgres from 'postgres'

loadEnvConfig(process.cwd())

const dbUrl = process.env.DATABASE_URL!
const client = postgres(dbUrl)

async function main() {
  console.log('Applying RLS policy fixes for prices table...')

  // First, let's see what policies currently exist
  const existingPolicies = await client`
    SELECT policyname FROM pg_policies WHERE tablename = 'prices';
  `
  console.log(
    'Existing policies:',
    existingPolicies.map((p) => p.policyname)
  )

  // Step 1: Drop ALL old policies that might conflict
  console.log('\n1. Dropping old policies...')
  const policiesToDrop = [
    'Enable read for customers (prices)',
    'On update, ensure usage meter belongs to same organization as product',
    'On update, ensure usage meter belongs to same organization as p',
    'Ensure organization integrity with products parent table',
    'Allow self organization records',
    'Ensure product FK integrity for non-usage prices',
    'Ensure usage meter FK integrity for usage prices',
    'On update, ensure usage meter belongs to same pricing model',
  ]

  for (const policyName of policiesToDrop) {
    try {
      await client.unsafe(
        `DROP POLICY IF EXISTS "${policyName}" ON "prices"`
      )
      console.log(`  Dropped: ${policyName}`)
    } catch (e) {
      console.log(`  Error dropping ${policyName}: ${e}`)
    }
  }

  // Step 2: Create new policies
  console.log('\n2. Creating new policies...')

  // Customer read policy with TO customer
  console.log('  Creating: Enable read for customers (prices)')
  await client.unsafe(`
    CREATE POLICY "Enable read for customers (prices)" ON "prices"
    AS PERMISSIVE
    FOR SELECT
    TO customer
    USING (
      "active" = true AND (
        "product_id" IN (SELECT "id" FROM "products")
        OR ("product_id" IS NULL AND "usage_meter_id" IN (SELECT "id" FROM "usage_meters"))
      )
    )
  `)

  // Merchant update policy for usage meter same pricing model
  console.log(
    '  Creating: On update, ensure usage meter belongs to same pricing model'
  )
  await client.unsafe(`
    CREATE POLICY "On update, ensure usage meter belongs to same pricing model" ON "prices"
    AS PERMISSIVE
    FOR UPDATE
    TO merchant
    WITH CHECK (
      "usage_meter_id" IS NULL
      OR "usage_meter_id" IN (
        SELECT "id" FROM "usage_meters"
        WHERE "usage_meters"."pricing_model_id" = "prices"."pricing_model_id"
      )
    )
  `)

  // Product FK integrity for non-usage prices
  console.log(
    '  Creating: Ensure product FK integrity for non-usage prices'
  )
  await client.unsafe(`
    CREATE POLICY "Ensure product FK integrity for non-usage prices" ON "prices"
    AS PERMISSIVE
    FOR ALL
    TO merchant
    USING ("type" = 'usage' OR "product_id" IN (SELECT "id" FROM "products"))
    WITH CHECK ("type" = 'usage' OR "product_id" IN (SELECT "id" FROM "products"))
  `)

  // Usage meter FK integrity for usage prices
  console.log(
    '  Creating: Ensure usage meter FK integrity for usage prices'
  )
  await client.unsafe(`
    CREATE POLICY "Ensure usage meter FK integrity for usage prices" ON "prices"
    AS PERMISSIVE
    FOR ALL
    TO merchant
    USING ("type" != 'usage' OR "usage_meter_id" IN (SELECT "id" FROM "usage_meters"))
    WITH CHECK ("type" != 'usage' OR "usage_meter_id" IN (SELECT "id" FROM "usage_meters"))
  `)

  // Verify the policies after applying
  console.log('\n3. Verifying policies after fix...')
  const newPolicies = await client`
    SELECT policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE tablename = 'prices'
    ORDER BY policyname;
  `
  console.log('\nNew policies:')
  for (const policy of newPolicies) {
    console.log(
      `  - ${policy.policyname} (${policy.cmd}, ${policy.permissive}, roles: ${policy.roles})`
    )
    if (policy.qual) {
      console.log(
        `      USING: ${policy.qual.substring(0, 80).replace(/\n/g, ' ')}...`
      )
    }
    if (policy.with_check) {
      console.log(
        `      WITH CHECK: ${policy.with_check.substring(0, 80).replace(/\n/g, ' ')}...`
      )
    }
  }

  await client.end()
  console.log('\nDone!')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
