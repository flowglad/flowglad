-- Custom SQL migration file, put your code below! --
ALTER TYPE "apiKeyType" ADD VALUE IF NOT EXISTS 'cli_session';