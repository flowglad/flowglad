#!/usr/bin/env node

/**
 * Script to detect multiple React versions in the dependency tree
 * This helps diagnose "Invalid hook call" errors
 */

const fs = require('fs')
const path = require('path')

function findReactVersions(dir, depth = 0, maxDepth = 5) {
  const versions = new Map()

  if (depth > maxDepth) return versions

  try {
    const nodeModulesPath = path.join(dir, 'node_modules')
    if (!fs.existsSync(nodeModulesPath)) return versions

    const reactPath = path.join(nodeModulesPath, 'react')
    if (fs.existsSync(reactPath)) {
      const packageJsonPath = path.join(reactPath, 'package.json')
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf8')
          )
          const version = packageJson.version
          const fullPath = path.resolve(reactPath)

          if (!versions.has(version)) {
            versions.set(version, [])
          }
          versions.get(version).push(fullPath)
        } catch (e) {
          // Skip invalid package.json
        }
      }
    }

    // Check bun's special structure
    const bunPath = path.join(nodeModulesPath, '.bun')
    if (fs.existsSync(bunPath)) {
      const entries = fs.readdirSync(bunPath)
      for (const entry of entries) {
        if (entry.startsWith('react@')) {
          const reactPackagePath = path.join(
            bunPath,
            entry,
            'node_modules',
            'react',
            'package.json'
          )
          if (fs.existsSync(reactPackagePath)) {
            try {
              const packageJson = JSON.parse(
                fs.readFileSync(reactPackagePath, 'utf8')
              )
              const version = packageJson.version
              const fullPath = path.resolve(
                path.join(bunPath, entry, 'node_modules', 'react')
              )

              if (!versions.has(version)) {
                versions.set(version, [])
              }
              versions.get(version).push(fullPath)
            } catch (e) {
              // Skip invalid package.json
            }
          }
        }
      }
    }

    // Recursively check parent directories
    const parentDir = path.dirname(dir)
    if (parentDir !== dir) {
      const parentVersions = findReactVersions(
        parentDir,
        depth + 1,
        maxDepth
      )
      for (const [version, paths] of parentVersions.entries()) {
        if (!versions.has(version)) {
          versions.set(version, [])
        }
        versions.get(version).push(...paths)
      }
    }
  } catch (e) {
    // Skip directories we can't read
  }

  return versions
}

// Check from the playground directory
const playgroundDir = __dirname
const rootDir = path.resolve(playgroundDir, '../..')

console.log('🔍 Checking for multiple React versions...\n')
console.log(`Checking from: ${playgroundDir}`)
console.log(`Root directory: ${rootDir}\n`)

const versions = findReactVersions(playgroundDir)

if (versions.size === 0) {
  console.log('❌ No React installations found')
  process.exit(1)
}

if (versions.size === 1) {
  const [version, paths] = Array.from(versions.entries())[0]
  console.log(`✅ Only one React version found: ${version}`)
  console.log(`   Location: ${paths[0]}\n`)
} else {
  console.log(`⚠️  Found ${versions.size} different React versions:\n`)

  for (const [version, paths] of versions.entries()) {
    console.log(
      `📦 React ${version} (found in ${paths.length} location(s)):`
    )
    paths.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p}`)
    })
    console.log('')
  }

  console.log(
    '❌ Multiple React versions detected! This can cause "Invalid hook call" errors.'
  )
  console.log('\n💡 Solutions:')
  console.log('   1. Ensure all packages use the same React version')
  console.log(
    '   2. Use yarn/npm resolutions or bun overrides to force a single version'
  )
  console.log(
    '   3. Check if any dependencies have peer dependency conflicts'
  )
  console.log(
    '   4. Clear node_modules and reinstall: bun install --force\n'
  )

  process.exit(1)
}
