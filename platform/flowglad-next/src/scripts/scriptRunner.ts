/* 
Run scripts using the script runner using the following command:
NODE_ENV=production bunx tsx scripts/example.ts

The script runner does the following:
 - Pulls environment variables from Vercel based on target env chosen
 - Connects to the database
 - Runs the script provided

Post script run regardless of the script's success or failure, the script runner will pull development environment variables from Vercel

To skip the environment pull step, add --skip-env-pull as an argument:
NODE_ENV=production bunx tsx scripts/example.ts --skip-env-pull

To use a custom database URL, pass it as the second argument:
NODE_ENV=production bunx tsx scripts/example.ts --skip-env-pull "postgresql://user:password@host:port/database"
*/

import core from '@/utils/core'
import { loadEnvConfig } from '@next/env'
import { execSync } from 'child_process'
import { PostgresJsDatabase, drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

function pullDevelopmentEnvVars() {
  execSync(`vercel env pull .env.local`, {
    stdio: 'inherit',
  })
  execSync('bun run postvercel:env-pull', {
    stdio: 'inherit',
  })
  // eslint-disable-next-line no-console
  console.info(
    '📥 Successfully pulled development environment variables'
  )
}

function rmDevelopmentEnvVars() {
  execSync('bun run vercel:env-rm', {
    stdio: 'inherit',
  })
}

export default async function runScript(
  scriptMethod: (db: PostgresJsDatabase) => Promise<void>,
  params?: { databaseUrl?: string; skipEnvPull?: boolean }
) {
  const env = process.env.NODE_ENV ?? 'development'
  const skipEnvPull =
    params?.skipEnvPull ?? process.argv.includes('--skip-env-pull')

  try {
    // Set git commit SHA environment variable
    const gitCommitSha = execSync('git rev-parse HEAD')
      .toString()
      .trim()
    process.env.VERCEL_GIT_COMMIT_SHA = gitCommitSha
    // eslint-disable-next-line no-console
    console.info(`🔍 Set VERCEL_GIT_COMMIT_SHA to ${gitCommitSha}`)
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

  // Use custom database URL if provided, otherwise use the default from environment variables
  const dbUrl =
    params?.databaseUrl || core.envVariable('DATABASE_URL')
  const client = postgres(dbUrl)
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
