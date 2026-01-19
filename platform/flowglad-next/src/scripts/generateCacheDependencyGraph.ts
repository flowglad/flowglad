/**
 * Script to generate a DOT file illustrating the cache dependency system.
 *
 * This script parses the codebase to find:
 * 1. CacheDependency definitions (the dependency types)
 * 2. Cached functions and their dependencies (via `cached()` calls)
 * 3. Cache-invalidating mutations (via `invalidateCache()` calls)
 *
 * It then generates a DOT file that visualizes:
 * - Cached functions as blue boxes
 * - Cache dependencies as yellow diamonds
 * - Mutations/invalidators as red boxes
 * - Edges showing which functions depend on which dependencies
 * - Edges showing which mutations invalidate which dependencies
 *
 * Usage:
 *   bun run src/scripts/generateCacheDependencyGraph.ts [output-path]
 *
 * Default output: cache-dependency-graph.dot
 */

import { promises as fs } from 'fs'
import path from 'path'

const SRC_DIR = path.join(__dirname, '..')

interface CachedFunction {
  name: string
  file: string
  namespace: string
  dependencies: string[]
}

interface InvalidationSite {
  file: string
  functionName: string
  dependencies: string[]
}

interface CacheDependencyType {
  name: string
  parameterType: string
}

/**
 * Extracts all CacheDependency type definitions from cache.ts
 */
async function extractCacheDependencyTypes(): Promise<
  CacheDependencyType[]
> {
  const cacheFilePath = path.join(SRC_DIR, 'utils/cache.ts')
  const content = await fs.readFile(cacheFilePath, 'utf8')

  const dependencies: CacheDependencyType[] = []

  // Find the CacheDependency object
  const cacheDependencyMatch = content.match(
    /export const CacheDependency\s*=\s*\{([\s\S]*?)\}\s*as const/
  )

  if (cacheDependencyMatch) {
    const objectContent = cacheDependencyMatch[1]

    // Match patterns like (handling multi-line):
    // customerSubscriptions: (customerId: string): CacheDependencyKey =>
    // or:
    // subscriptionItemFeatures: (
    //   subscriptionItemId: string
    // ): CacheDependencyKey =>
    const regex =
      /(\w+):\s*\(\s*(\w+):\s*string\s*\)(?::\s*CacheDependencyKey)?\s*=>/g
    let match

    while ((match = regex.exec(objectContent)) !== null) {
      dependencies.push({
        name: match[1],
        parameterType: match[2],
      })
    }
  }

  return dependencies
}

/**
 * Finds all cached() function definitions and extracts their dependencies
 */
async function findCachedFunctions(
  srcDir: string
): Promise<CachedFunction[]> {
  const cachedFunctions: CachedFunction[] = []

  async function scanDirectory(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        // Skip node_modules, test files, etc.
        if (
          entry.name === 'node_modules' ||
          entry.name === '.next' ||
          entry.name === 'dist'
        ) {
          continue
        }
        await scanDirectory(fullPath)
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.integration.test.ts')
      ) {
        const content = await fs.readFile(fullPath, 'utf8')

        // Look for cached() function definitions
        // Pattern: const functionName = cached(
        // or: export const functionName = cached(
        const cachedPattern =
          /(?:export\s+)?const\s+(\w+)\s*=\s*cached\s*\(\s*\{([\s\S]*?)\},\s*(?:async\s*)?\(/g

        let match
        while ((match = cachedPattern.exec(content)) !== null) {
          const functionName = match[1]
          const configContent = match[2]

          // Extract namespace
          const namespaceMatch = configContent.match(
            /namespace:\s*RedisKeyNamespace\.(\w+)/
          )
          const namespace = namespaceMatch
            ? namespaceMatch[1]
            : 'unknown'

          // Extract dependencies from dependenciesFn
          const dependencies: string[] = []
          const dependenciesMatch = configContent.match(
            /dependenciesFn:\s*\([^)]*\)\s*=>\s*\[([\s\S]*?)\]/
          )

          if (dependenciesMatch) {
            const depsContent = dependenciesMatch[1]
            // Match CacheDependency.xxx(yyy)
            const depPattern = /CacheDependency\.(\w+)\s*\(/g
            let depMatch
            while (
              (depMatch = depPattern.exec(depsContent)) !== null
            ) {
              dependencies.push(depMatch[1])
            }
          }

          const relativePath = path.relative(srcDir, fullPath)

          cachedFunctions.push({
            name: functionName,
            file: relativePath,
            namespace,
            dependencies,
          })
        }

        // Also look for cachedBulkLookup() definitions
        const bulkPattern =
          /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*(?::\s*[^=]+)?\s*=>\s*)?cachedBulkLookup\s*\(\s*\{([\s\S]*?)\},/g

        while ((match = bulkPattern.exec(content)) !== null) {
          const functionName = match[1]
          const configContent = match[2]

          // Extract namespace
          const namespaceMatch = configContent.match(
            /namespace:\s*RedisKeyNamespace\.(\w+)/
          )
          const namespace = namespaceMatch
            ? namespaceMatch[1]
            : 'unknown'

          // Extract dependencies
          const dependencies: string[] = []
          const dependenciesMatch = configContent.match(
            /dependenciesFn:\s*\([^)]*\)\s*=>\s*\[([\s\S]*?)\]/
          )

          if (dependenciesMatch) {
            const depsContent = dependenciesMatch[1]
            const depPattern = /CacheDependency\.(\w+)\s*\(/g
            let depMatch
            while (
              (depMatch = depPattern.exec(depsContent)) !== null
            ) {
              dependencies.push(depMatch[1])
            }
          }

          const relativePath = path.relative(srcDir, fullPath)

          cachedFunctions.push({
            name: functionName,
            file: relativePath,
            namespace,
            dependencies,
          })
        }
      }
    }
  }

  await scanDirectory(srcDir)
  return cachedFunctions
}

/**
 * Finds all invalidateCache() calls and extracts what they invalidate
 */
async function findInvalidationSites(
  srcDir: string
): Promise<InvalidationSite[]> {
  const invalidationSites: InvalidationSite[] = []

  // Files to exclude (type definitions, the script itself, etc.)
  const excludedFiles = [
    'generateCacheDependencyGraph.ts',
    'types.ts',
  ]

  async function scanDirectory(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '.next' ||
          entry.name === 'dist'
        ) {
          continue
        }
        await scanDirectory(fullPath)
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.integration.test.ts') &&
        !excludedFiles.includes(entry.name)
      ) {
        const content = await fs.readFile(fullPath, 'utf8')

        // Skip if file doesn't contain invalidateCache call (not just the word)
        if (!content.includes('invalidateCache(')) {
          continue
        }

        // Skip if file is just importing or typing invalidateCache
        const hasActualInvalidateCacheCall =
          /invalidateCache\s*\(\s*(?:CacheDependency|\.\.\.)/g.test(
            content
          )

        if (!hasActualInvalidateCacheCall) {
          continue
        }

        const relativePath = path.relative(srcDir, fullPath)

        // Find invalidateCache calls
        // Pattern: invalidateCache(CacheDependency.xxx(...), ...)
        const invalidatePattern =
          /invalidateCache\s*\(\s*([\s\S]*?)\s*\)(?=\s*[;\n])/g

        let match
        while ((match = invalidatePattern.exec(content)) !== null) {
          const argsContent = match[1]

          // Extract all CacheDependency.xxx references
          const dependencies: string[] = []
          const depPattern = /CacheDependency\.(\w+)\s*\(/g
          let depMatch
          while ((depMatch = depPattern.exec(argsContent)) !== null) {
            if (!dependencies.includes(depMatch[1])) {
              dependencies.push(depMatch[1])
            }
          }

          if (dependencies.length > 0) {
            // Try to find the enclosing function name
            const beforeMatch = content.substring(0, match.index)
            let functionName = 'unknown'

            // Look for function/const declarations - try multiple patterns
            // and use the closest one (last match before the invalidateCache call)
            const funcPatterns = [
              // async function name(
              /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]+>)?\s*\(/g,
              // const name = async (
              /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/g,
              // const name = async function
              /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?function/g,
              // const name = async ({
              /(?:export\s+)?const\s+(\w+)\s*=\s*async\s*\(\s*\{/g,
              // export const handleXxx = async (params
              /export\s+const\s+(\w+)\s*=\s*async\s*\(\s*params/g,
              // TRPC: export const fooRouter = createTRPCRouter({
              /export\s+const\s+(\w+Router)\s*=/g,
            ]

            for (const pattern of funcPatterns) {
              let funcMatch
              while (
                (funcMatch = pattern.exec(beforeMatch)) !== null
              ) {
                // Only use valid function names (not keywords or common variable names)
                const name = funcMatch[1]
                if (
                  name &&
                  ![
                    'const',
                    'let',
                    'var',
                    'function',
                    'async',
                    'await',
                    'return',
                  ].includes(name) &&
                  name.length > 2
                ) {
                  functionName = name
                }
              }
            }

            // Special handling for TRPC routers: try to find the procedure name
            // Look for patterns like: const name = protectedProcedure
            if (
              functionName.endsWith('Router') ||
              functionName === 'unknown'
            ) {
              const procedurePatterns = [
                // const name = protectedProcedure or const name = publicProcedure
                /const\s+(\w+)\s*=\s*(?:protected|public)Procedure/g,
                // name: protectedProcedure or name: publicProcedure (in object)
                /(\w+):\s*(?:protected|public)Procedure/g,
              ]

              for (const pattern of procedurePatterns) {
                let procMatch
                while (
                  (procMatch = pattern.exec(beforeMatch)) !== null
                ) {
                  const name = procMatch[1]
                  if (
                    name &&
                    ![
                      'input',
                      'output',
                      'mutation',
                      'query',
                    ].includes(name) &&
                    name.length > 2
                  ) {
                    functionName = name
                  }
                }
              }
            }

            // Check if we already have this site (to avoid duplicates)
            const existingSite = invalidationSites.find(
              (site) =>
                site.file === relativePath &&
                site.functionName === functionName
            )

            if (existingSite) {
              // Merge dependencies
              for (const dep of dependencies) {
                if (!existingSite.dependencies.includes(dep)) {
                  existingSite.dependencies.push(dep)
                }
              }
            } else {
              invalidationSites.push({
                file: relativePath,
                functionName,
                dependencies,
              })
            }
          }
        }
      }
    }
  }

  await scanDirectory(srcDir)
  return invalidationSites
}

/**
 * Generates a DOT file from the extracted data
 */
function generateDotFile(
  dependencyTypes: CacheDependencyType[],
  cachedFunctions: CachedFunction[],
  invalidationSites: InvalidationSite[]
): string {
  const lines: string[] = []

  lines.push('digraph CacheDependencyGraph {')
  lines.push('  rankdir=TB;')
  lines.push('  node [fontname="Helvetica"];')
  lines.push('  edge [fontname="Helvetica", fontsize=10];')
  lines.push('')

  // Legend
  lines.push('  // Legend')
  lines.push('  subgraph cluster_legend {')
  lines.push('    label="Legend";')
  lines.push('    fontsize=14;')
  lines.push('    style=dashed;')
  lines.push(
    '    legend_cached [label="Cached Function" shape=box style=filled fillcolor="#87CEEB"];'
  )
  lines.push(
    '    legend_dep [label="Cache Dependency" shape=diamond style=filled fillcolor="#FFD700"];'
  )
  lines.push(
    '    legend_invalidator [label="Invalidator" shape=box style=filled fillcolor="#FF6B6B"];'
  )
  lines.push(
    '    legend_cached -> legend_dep [label="depends on" style=dashed];'
  )
  lines.push(
    '    legend_invalidator -> legend_dep [label="invalidates" color="red"];'
  )
  lines.push('  }')
  lines.push('')

  // Cache Dependency nodes (diamonds)
  lines.push('  // Cache Dependencies')
  lines.push('  subgraph cluster_dependencies {')
  lines.push('    label="Cache Dependencies";')
  lines.push('    style=rounded;')
  for (const dep of dependencyTypes) {
    const nodeId = `dep_${dep.name}`
    lines.push(
      `    ${nodeId} [label="${dep.name}\\n(${dep.parameterType})" shape=diamond style=filled fillcolor="#FFD700"];`
    )
  }
  lines.push('  }')
  lines.push('')

  // Cached Function nodes (blue boxes)
  lines.push('  // Cached Functions')
  lines.push('  subgraph cluster_cached {')
  lines.push('    label="Cached Functions";')
  lines.push('    style=rounded;')
  for (const func of cachedFunctions) {
    const nodeId = `cached_${func.name}`
    const shortFile = func.file.split('/').slice(-2).join('/')
    lines.push(
      `    ${nodeId} [label="${func.name}\\n[${func.namespace}]\\n${shortFile}" shape=box style=filled fillcolor="#87CEEB"];`
    )
  }
  lines.push('  }')
  lines.push('')

  // Invalidator nodes (red boxes)
  lines.push('  // Invalidators')
  lines.push('  subgraph cluster_invalidators {')
  lines.push('    label="Cache Invalidators";')
  lines.push('    style=rounded;')
  for (const site of invalidationSites) {
    const nodeId = `inv_${sanitizeNodeId(site.file)}_${site.functionName}`
    const shortFile = site.file.split('/').slice(-2).join('/')
    lines.push(
      `    ${nodeId} [label="${site.functionName}\\n${shortFile}" shape=box style=filled fillcolor="#FF6B6B"];`
    )
  }
  lines.push('  }')
  lines.push('')

  // Edges: Cached functions -> Dependencies
  lines.push('  // Cached Function -> Dependency edges')
  for (const func of cachedFunctions) {
    for (const dep of func.dependencies) {
      const fromId = `cached_${func.name}`
      const toId = `dep_${dep}`
      lines.push(`  ${fromId} -> ${toId} [style=dashed];`)
    }
  }
  lines.push('')

  // Edges: Invalidators -> Dependencies
  lines.push('  // Invalidator -> Dependency edges')
  for (const site of invalidationSites) {
    for (const dep of site.dependencies) {
      const fromId = `inv_${sanitizeNodeId(site.file)}_${site.functionName}`
      const toId = `dep_${dep}`
      lines.push(`  ${fromId} -> ${toId} [color="red"];`)
    }
  }

  lines.push('}')

  return lines.join('\n')
}

/**
 * Sanitize a string to be a valid DOT node ID
 */
function sanitizeNodeId(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, '_')
}

/**
 * Generates a summary report
 */
function generateSummary(
  dependencyTypes: CacheDependencyType[],
  cachedFunctions: CachedFunction[],
  invalidationSites: InvalidationSite[]
): string {
  const lines: string[] = []

  lines.push('# Cache Dependency Graph Summary')
  lines.push('')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push('')

  lines.push('## Cache Dependencies')
  lines.push('')
  for (const dep of dependencyTypes) {
    lines.push(`- **${dep.name}** (parameter: ${dep.parameterType})`)
  }
  lines.push('')

  lines.push('## Cached Functions')
  lines.push('')
  lines.push('| Function | File | Namespace | Dependencies |')
  lines.push('|----------|------|-----------|--------------|')
  for (const func of cachedFunctions) {
    lines.push(
      `| ${func.name} | ${func.file} | ${func.namespace} | ${func.dependencies.join(', ')} |`
    )
  }
  lines.push('')

  lines.push('## Cache Invalidators')
  lines.push('')
  lines.push('| Function | File | Invalidates |')
  lines.push('|----------|------|-------------|')
  for (const site of invalidationSites) {
    lines.push(
      `| ${site.functionName} | ${site.file} | ${site.dependencies.join(', ')} |`
    )
  }
  lines.push('')

  // Coverage analysis
  lines.push('## Coverage Analysis')
  lines.push('')

  const usedDependencies = new Set<string>()
  for (const func of cachedFunctions) {
    for (const dep of func.dependencies) {
      usedDependencies.add(dep)
    }
  }

  const invalidatedDependencies = new Set<string>()
  for (const site of invalidationSites) {
    for (const dep of site.dependencies) {
      invalidatedDependencies.add(dep)
    }
  }

  const definedDeps = new Set(dependencyTypes.map((d) => d.name))

  const usedButNotInvalidated = [...usedDependencies].filter(
    (d) => !invalidatedDependencies.has(d)
  )
  const invalidatedButNotUsed = [...invalidatedDependencies].filter(
    (d) => !usedDependencies.has(d)
  )
  const definedButNotUsed = [...definedDeps].filter(
    (d) => !usedDependencies.has(d) && !invalidatedDependencies.has(d)
  )

  if (usedButNotInvalidated.length > 0) {
    lines.push(
      '### ⚠️ Dependencies used by cached functions but never invalidated:'
    )
    for (const dep of usedButNotInvalidated) {
      lines.push(`- ${dep}`)
    }
    lines.push('')
  }

  if (invalidatedButNotUsed.length > 0) {
    lines.push(
      '### ⚠️ Dependencies invalidated but not used by any cached function:'
    )
    for (const dep of invalidatedButNotUsed) {
      lines.push(`- ${dep}`)
    }
    lines.push('')
  }

  if (definedButNotUsed.length > 0) {
    lines.push('### ℹ️ Dependencies defined but not used anywhere:')
    for (const dep of definedButNotUsed) {
      lines.push(`- ${dep}`)
    }
    lines.push('')
  }

  if (
    usedButNotInvalidated.length === 0 &&
    invalidatedButNotUsed.length === 0 &&
    definedButNotUsed.length === 0
  ) {
    lines.push('✅ All dependencies are properly connected!')
    lines.push('')
  }

  return lines.join('\n')
}

async function main(): Promise<void> {
  const outputPath = process.argv[2] || 'cache-dependency-graph.dot'
  const summaryPath = outputPath.replace(/\.dot$/, '-summary.md')

  console.log('Scanning codebase for cache patterns...')
  console.log(`Source directory: ${SRC_DIR}`)
  console.log('')

  // Extract data
  const [dependencyTypes, cachedFunctions, invalidationSites] =
    await Promise.all([
      extractCacheDependencyTypes(),
      findCachedFunctions(SRC_DIR),
      findInvalidationSites(SRC_DIR),
    ])

  console.log(
    `Found ${dependencyTypes.length} cache dependency types`
  )
  console.log(`Found ${cachedFunctions.length} cached functions`)
  console.log(`Found ${invalidationSites.length} invalidation sites`)
  console.log('')

  // Generate DOT file
  const dotContent = generateDotFile(
    dependencyTypes,
    cachedFunctions,
    invalidationSites
  )

  await fs.writeFile(outputPath, dotContent, 'utf8')
  console.log(`Generated DOT file: ${outputPath}`)

  // Generate summary
  const summaryContent = generateSummary(
    dependencyTypes,
    cachedFunctions,
    invalidationSites
  )

  await fs.writeFile(summaryPath, summaryContent, 'utf8')
  console.log(`Generated summary: ${summaryPath}`)

  console.log('')
  console.log('To visualize the graph:')
  console.log(
    `  dot -Tpng ${outputPath} -o cache-dependency-graph.png`
  )
  console.log(
    `  dot -Tsvg ${outputPath} -o cache-dependency-graph.svg`
  )
  console.log('')
  console.log(
    'Or use an online viewer like https://dreampuf.github.io/GraphvizOnline/'
  )
}

main().catch((err) => {
  console.error('Error generating cache dependency graph:', err)
  process.exit(1)
})
