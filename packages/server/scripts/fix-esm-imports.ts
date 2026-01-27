/**
 * Post-build script to fix ESM imports by adding .js extensions to relative imports.
 * ESM requires explicit file extensions for relative imports, but tsup with bundle: false
 * doesn't add them automatically.
 *
 * This script finds all .js files in dist/esm and rewrites imports like:
 *   import { foo } from "./bar"  ->  import { foo } from "./bar.js"
 *   import { foo } from "../baz" ->  import { foo } from "../baz.js" (or ../baz/index.js)
 */

import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const ESM_DIR = join(import.meta.dirname, '..', 'dist', 'esm')

/**
 * Recursively get all .js files in a directory
 */
async function getJsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await getJsFiles(fullPath)))
    } else if (entry.name.endsWith('.js')) {
      files.push(fullPath)
    }
  }

  return files
}

/**
 * Check if a path exists and is a directory
 */
async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path)
    return stats.isDirectory()
  } catch {
    return false
  }
}

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Fix imports in a single file
 */
async function fixImportsInFile(filePath: string): Promise<boolean> {
  const content = await readFile(filePath, 'utf-8')
  const fileDir = dirname(filePath)

  // Match import/export statements with relative paths (starting with ./ or ../)
  // This regex handles:
  // - import { x } from "./foo"
  // - import x from "./foo"
  // - export { x } from "./foo"
  // - export * from "./foo"
  const importExportRegex =
    /((?:import|export)\s*(?:\{[^}]*\}|\*(?:\s*as\s+\w+)?|[\w$]+(?:\s*,\s*\{[^}]*\})?)?(?:\s*from)?\s*['"])(\.[^'"]+)(['"])/g

  let modified = false
  const newContent = await replaceAsync(
    content,
    importExportRegex,
    async (match, prefix, importPath, suffix) => {
      // Skip if already has .js extension
      if (importPath.endsWith('.js')) {
        return match
      }

      // Resolve the import path relative to the current file
      const resolvedPath = join(fileDir, importPath)

      // Check if it's a directory (needs /index.js)
      if (await isDirectory(resolvedPath)) {
        modified = true
        return `${prefix}${importPath}/index.js${suffix}`
      }

      // Check if .js file exists
      if (await fileExists(`${resolvedPath}.js`)) {
        modified = true
        return `${prefix}${importPath}.js${suffix}`
      }

      // If neither exists, just add .js and hope for the best
      // (the file might be generated later or be external)
      modified = true
      return `${prefix}${importPath}.js${suffix}`
    }
  )

  if (modified) {
    await writeFile(filePath, newContent, 'utf-8')
    return true
  }

  return false
}

/**
 * Helper to do async string replacement
 */
async function replaceAsync(
  str: string,
  regex: RegExp,
  asyncFn: (match: string, ...args: string[]) => Promise<string>
): Promise<string> {
  const promises: Promise<string>[] = []
  str.replace(regex, (match, ...args) => {
    promises.push(asyncFn(match, ...args))
    return match
  })
  const results = await Promise.all(promises)
  return str.replace(regex, () => results.shift()!)
}

async function main() {
  console.log('Fixing ESM imports in', ESM_DIR)

  const files = await getJsFiles(ESM_DIR)
  console.log(`Found ${files.length} .js files`)

  let fixedCount = 0
  for (const file of files) {
    const wasFixed = await fixImportsInFile(file)
    if (wasFixed) {
      fixedCount++
      console.log(`  Fixed: ${file.replace(ESM_DIR, '')}`)
    }
  }

  console.log(`Done! Fixed ${fixedCount} files`)
}

main().catch((err) => {
  console.error('Error fixing ESM imports:', err)
  process.exit(1)
})
