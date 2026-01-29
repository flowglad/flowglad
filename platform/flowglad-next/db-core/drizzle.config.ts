import type { Config } from 'drizzle-kit'

export default {
  schema: './schema/!(*.test).ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
  casing: 'camelCase',
} satisfies Config
