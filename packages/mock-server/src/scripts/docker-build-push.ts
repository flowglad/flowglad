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
 *   - For pushing: must be logged in to ghcr.io
 *     Run: echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
 */

import { $ } from 'bun'
import { dirname, resolve } from 'path'
import { DOCKER_CONFIG } from '../docker-config'

interface Args {
  tag: string
  push: boolean
  help: boolean
}

const parseArgs = (): Args => {
  const args = process.argv.slice(2)
  const result: Args = {
    tag: 'latest',
    push: false,
    help: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--tag': {
        const nextArg = args[i + 1]
        if (!nextArg || nextArg.startsWith('-')) {
          console.error('Error: --tag requires a value')
          process.exit(1)
        }
        result.tag = nextArg
        i++
        break
      }
      case '--push':
        result.push = true
        break
      case '--help':
      case '-h':
        result.help = true
        break
    }
  }

  return result
}

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
  - For pushing: must be logged in to ghcr.io
    Run: echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

Image: ${DOCKER_CONFIG.fullImage}
`)
}

const main = async () => {
  const args = parseArgs()

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
