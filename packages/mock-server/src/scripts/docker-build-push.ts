#!/usr/bin/env bun
/**
 * Build and push the flowglad-mock-server Docker image to GHCR.
 *
 * Usage:
 *   bun run docker:build              # Build for local platform only
 *   bun run docker:build --tag v1.0   # Build with custom tag
 *   bun run docker:push               # Build multi-platform and push (default tag: latest)
 *   bun run docker:push --tag v1.0    # Build multi-platform and push with custom tag
 *
 * Prerequisites:
 *   - Docker must be installed and running
 *   - gh CLI must be installed and authenticated (for pushing)
 *
 * Notes:
 *   - docker:push builds for both linux/amd64 (CI) and linux/arm64 (Mac ARM)
 *   - docker:build only builds for the local platform (faster for local testing)
 */

import { $ } from 'bun'
import { dirname, resolve } from 'path'
import { parseArgs } from 'util'
import { DOCKER_CONFIG } from '../docker-config'

// Platforms to build for when pushing (CI needs amd64, Mac ARM needs arm64)
const MULTI_PLATFORMS = 'linux/amd64,linux/arm64'

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
  bun run docker:build              Build for local platform only
  bun run docker:build --tag v1.0   Build with custom tag
  bun run docker:push               Build multi-platform and push (default tag: latest)
  bun run docker:push --tag v1.0    Build multi-platform and push with custom tag

Options:
  --tag TAG    Tag to use (default: latest)
  --push       Build for all platforms and push to registry
  --help, -h   Show this help message

Prerequisites:
  - Docker must be installed and running
  - gh CLI must be installed and authenticated (for pushing)

Platforms (when pushing): ${MULTI_PLATFORMS}
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

  if (args.push) {
    // Login to GHCR using gh CLI credentials first
    const loginScript = resolve(dirname(scriptPath), 'ghcr-login.ts')
    await $`bun run ${loginScript}`

    console.log(
      'Building and pushing multi-platform mock-server image...'
    )
    console.log(`  Image: ${fullImageWithTag}`)
    console.log(`  Platforms: ${MULTI_PLATFORMS}`)
    console.log(`  Context: ${packageDir}`)

    // Multi-platform builds must push directly (can't load into local daemon)
    await $`docker buildx build --platform ${MULTI_PLATFORMS} -t ${fullImageWithTag} -f ${dockerfile} --push ${packageDir}`

    console.log(`\n✓ Build and push complete: ${fullImageWithTag}`)
  } else {
    console.log('Building mock-server image for local platform...')
    console.log(`  Image: ${fullImageWithTag}`)
    console.log(`  Context: ${packageDir}`)

    // Local build for testing - uses native platform
    await $`docker build -t ${fullImageWithTag} -f ${dockerfile} ${packageDir}`

    console.log(`\n✓ Build complete: ${fullImageWithTag}`)
    console.log(
      '\nSkipping push (use --push to build multi-platform and push)'
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
