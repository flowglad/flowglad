#!/usr/bin/env bun
/**
 * Log into GitHub Container Registry using gh CLI credentials.
 *
 * Prerequisites:
 *   - gh CLI must be installed and authenticated (gh auth login)
 *
 * Usage:
 *   bun run ghcr:login
 */

import { $ } from 'bun'

const main = async () => {
  // Check if gh CLI is available and authenticated
  const { exitCode } = await $`gh auth status`.nothrow().quiet()
  if (exitCode !== 0) {
    console.error('Error: gh CLI is not authenticated.')
    console.error('Run: gh auth login')
    process.exit(1)
  }

  // Get username and token from gh CLI
  const username = await $`gh api user --jq .login`.text()
  const token = await $`gh auth token`.text()

  // Login to GHCR
  console.log('Logging into ghcr.io...')
  await $`echo ${token.trim()} | docker login ghcr.io -u ${username.trim()} --password-stdin`

  console.log('✓ Logged into ghcr.io')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
