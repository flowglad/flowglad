import { loadEnvConfig } from '@next/env'
import postgres from 'postgres'

loadEnvConfig(process.cwd())

const dbUrl = process.env.DATABASE_URL!
const client = postgres(dbUrl)

async function main() {
  const result = await client`
    SELECT * FROM drizzle.__drizzle_migrations
    ORDER BY id DESC
    LIMIT 15;
  `
  console.log('Last 15 migrations:')
  for (const row of result) {
    console.log(
      `  ${row.id}: ${row.hash} - created: ${row.created_at}`
    )
  }
  await client.end()
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
