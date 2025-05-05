import type { Config } from 'drizzle-kit'
import core from './src/utils/core'

export default {
  schema: './src/db/schema/!(*.test).ts',
  out: './drizzle-migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: core.envVariable('DATABASE_URL'),
  },
  verbose: true,
  strict: true,
  casing: 'camelCase',
} satisfies Config
