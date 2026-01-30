#!/usr/bin/env bun
/**
 * Build and push the flowglad-mock-server Docker image to GHCR.
 *
 * Usage:
 *   bun run docker:build              # Build only (default tag: latest)
 *   bun run docker:build --tag v1.0   # Build with custom tag
 *   bun run docker:push               # Build and push (default tag: latest)
 *   bun run docker:push --tag v1.0    # Build and push with custom tag
 *
 * Prerequisites:
 *   - Docker must be installed and running
 *   - gh CLI must be installed and authenticated (for pushing)
 */

import { $ } from 'bun'
import { dirname, resolve } from 'path'
import { parseArgs } from 'util'
import { DOCKER_CONFIG } from '../docker-config'

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    tag: { type: 'string', default: 'latest' },
    push: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: true,
})

const printHelp = () => {
  console.log(`
Build and push the flowglad-mock-server Docker image to GHCR.

Usage:
  bun run docker:build              Build only (default tag: latest)
  bun run docker:build --tag v1.0   Build with custom tag
  bun run docker:push               Build and push (default tag: latest)
  bun run docker:push --tag v1.0    Build and push with custom tag

Options:
  --tag TAG    Tag to use (default: latest)
  --push       Push to registry after building
  --help, -h   Show this help message

Prerequisites:
  - Docker must be installed and running
  - gh CLI must be installed and authenticated (for pushing)

Image: ${DOCKER_CONFIG.fullImage}
`)
}

const main = async () => {
  if (args.help) {
    printHelp()
    process.exit(0)
  }

  // Get the package directory (parent of src/scripts)
  const scriptPath = import.meta.path
  const packageDir = resolve(dirname(scriptPath), '..', '..')
  const dockerfile = resolve(packageDir, 'Dockerfile')

  const fullImageWithTag = `${DOCKER_CONFIG.fullImage}:${args.tag}`

  console.log('Building mock-server image...')
  console.log(`  Image: ${fullImageWithTag}`)
  console.log(`  Context: ${packageDir}`)

  // Build the image
  await $`docker build -t ${fullImageWithTag} -f ${dockerfile} ${packageDir}`

  console.log(`\n✓ Build complete: ${fullImageWithTag}`)

  if (args.push) {
    // Login to GHCR using gh CLI credentials
    const loginScript = resolve(dirname(scriptPath), 'ghcr-login.ts')
    await $`bun run ${loginScript}`

    console.log('\nPushing to registry...')
    await $`docker push ${fullImageWithTag}`
    console.log(`✓ Push complete: ${fullImageWithTag}`)
  } else {
    console.log('\nSkipping push (use --push to push to registry)')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
