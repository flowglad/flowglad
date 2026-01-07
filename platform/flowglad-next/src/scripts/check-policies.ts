import { loadEnvConfig } from '@next/env'
import postgres from 'postgres'

loadEnvConfig(process.cwd())

const dbUrl = process.env.DATABASE_URL!
const client = postgres(dbUrl)

async function main() {
  const result = await client`
    SELECT policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE tablename = 'prices'
    ORDER BY policyname;
  `
  console.log('Prices table policies:')
  console.log(JSON.stringify(result, null, 2))
  await client.end()
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
