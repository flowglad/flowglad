import { loadEnvConfig } from '@next/env'
import * as fs from 'fs'
import * as path from 'path'
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

  // Read and execute migration 0266
  const migration0266Path = path.join(
    process.cwd(),
    'drizzle-migrations/0266_price_nullable_productid.sql'
  )
  if (fs.existsSync(migration0266Path)) {
    console.log(
      '\nApplying migration 0266_price_nullable_productid.sql...'
    )
    const sql0266 = fs.readFileSync(migration0266Path, 'utf-8')

    // Split by statement breakpoint and execute each statement
    const statements = sql0266
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'))

    for (const stmt of statements) {
      if (stmt.trim()) {
        try {
          console.log(`  Executing: ${stmt.substring(0, 80)}...`)
          await client.unsafe(stmt)
          console.log('    Success')
        } catch (e: unknown) {
          const error = e as Error & { code?: string }
          // Ignore "already exists" or "does not exist" errors
          if (
            error.code === '42710' ||
            error.code === '42P07' ||
            error.code === '42704'
          ) {
            console.log(
              `    Skipped (already exists or does not exist)`
            )
          } else {
            console.error(`    Error: ${error.message}`)
          }
        }
      }
    }
  }

  // Read and execute migration 0267
  const migration0267Path = path.join(
    process.cwd(),
    'drizzle-migrations/0267_fix_prices_rls_withcheck.sql'
  )
  if (fs.existsSync(migration0267Path)) {
    console.log(
      '\nApplying migration 0267_fix_prices_rls_withcheck.sql...'
    )
    const sql0267 = fs.readFileSync(migration0267Path, 'utf-8')

    const statements = sql0267
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'))

    for (const stmt of statements) {
      if (stmt.trim()) {
        try {
          console.log(`  Executing: ${stmt.substring(0, 80)}...`)
          await client.unsafe(stmt)
          console.log('    Success')
        } catch (e: unknown) {
          const error = e as Error & { code?: string }
          if (
            error.code === '42710' ||
            error.code === '42P07' ||
            error.code === '42704'
          ) {
            console.log(
              `    Skipped (already exists or does not exist)`
            )
          } else {
            console.error(`    Error: ${error.message}`)
          }
        }
      }
    }
  }

  // Verify the policies after applying
  console.log('\n\nVerifying policies after fix...')
  const newPolicies = await client`
    SELECT policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE tablename = 'prices'
    ORDER BY policyname;
  `
  console.log('New policies:')
  for (const policy of newPolicies) {
    console.log(
      `  - ${policy.policyname} (${policy.cmd}, ${policy.permissive})`
    )
    if (policy.qual) {
      console.log(`      USING: ${policy.qual.substring(0, 100)}...`)
    }
    if (policy.with_check) {
      console.log(
        `      WITH CHECK: ${policy.with_check.substring(0, 100)}...`
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
