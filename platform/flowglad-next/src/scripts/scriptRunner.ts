/* 
Run scripts using the script runner using the following command:
NODE_ENV=production yarn tsx scripts/example.ts

The script runner does the following:
 - Pulls environment variables from Vercel based on target env chosen
 - Connects to the database
 - Runs the script provided

Post script run regardless of the script's success or failure, the script runner will pull development environment variables from Vercel

To skip the environment pull step, add --skip-env-pull as an argument:
NODE_ENV=production yarn tsx scripts/example.ts --skip-env-pull
*/

import core from '@/utils/core'
import { loadEnvConfig } from '@next/env'
import { execSync } from 'child_process'
import { PostgresJsDatabase, drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

function pullDevelopmentEnvVars() {
  execSync(`vercel env pull --environment='development'`, {
    stdio: 'inherit',
  })
  execSync('pnpm postvercel:env-pull', {
    stdio: 'inherit',
  })
  // eslint-disable-next-line no-console
  console.info(
    '📥 Successfully pulled development environment variables'
  )
}

function rmDevelopmentEnvVars() {
  execSync('pnpm vercel:env-rm', {
    stdio: 'inherit',
  })
}

export default async function runScript(
  scriptMethod: (db: PostgresJsDatabase) => Promise<void>
) {
  const env = process.env.NODE_ENV ?? 'development'
  const skipEnvPull = process.argv.includes('--skip-env-pull')

  try {
    if (!skipEnvPull) {
      rmDevelopmentEnvVars()
      execSync(`vercel env pull --environment=${env}`, {
        stdio: 'inherit',
      })
      // eslint-disable-next-line no-console
      console.info(
        `📥 Successfully ran vercel env pull command for ${env}`
      )
    } else {
      // eslint-disable-next-line no-console
      console.info('⏩ Skipping environment pull as requested')
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `❌ Error running vercel env pull command for ${env}:`,
      error
    )
    if (!skipEnvPull) {
      pullDevelopmentEnvVars()
    }
    process.exit(1)
  }

  const projectDir = process.cwd()
  // To load env vars in the script
  loadEnvConfig(projectDir)

  const client = postgres(core.envVariable('DATABASE_URL'))
  const db = drizzle(client, { logger: true })

  try {
    await scriptMethod(db)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ Error running script:', error)
    if (!skipEnvPull) {
      pullDevelopmentEnvVars()
    }
    process.exit(1)
  } finally {
    // eslint-disable-next-line no-console
    console.log('Script has finished running successfully.')
    if (!skipEnvPull) {
      pullDevelopmentEnvVars()
    }
    process.exit(0)
  }
}
