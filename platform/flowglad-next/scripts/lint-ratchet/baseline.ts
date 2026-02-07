import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { dirname, join, resolve } from 'path'
import type { BaselineEntry } from './types'

export const BASELINE_FILENAME = '.lint-baseline.tsv'

/**
 * Parse TSV content into baseline entries
 * Skips malformed lines and logs warnings
 */
export const parseBaselineTsv = (
  content: string
): BaselineEntry[] => {
  if (!content) {
    return []
  }

  const lines = content.split('\n')
  const entries: BaselineEntry[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '') {
      continue
    }

    const parts = line.split('\t')
    if (parts.length !== 3) {
      console.warn(
        `Skipping malformed baseline entry at line ${i + 1}: expected 3 tab-separated values, got ${parts.length}`
      )
      continue
    }

    const [filePath, ruleName, countStr] = parts

    if (!filePath || !ruleName) {
      console.warn(
        `Skipping malformed baseline entry at line ${i + 1}: filePath and ruleName must be non-empty`
      )
      continue
    }

    const count = parseInt(countStr, 10)
    if (isNaN(count) || count < 0) {
      console.warn(
        `Skipping malformed baseline entry at line ${i + 1}: count must be a non-negative integer, got "${countStr}"`
      )
      continue
    }

    entries.push({ filePath, ruleName, count })
  }

  return entries
}

/**
 * Format baseline entries as TSV content
 * Entries are sorted by filePath then ruleName for deterministic output
 * Filters out entries with count <= 0
 */
export const formatBaselineTsv = (
  entries: BaselineEntry[]
): string => {
  const validEntries = entries.filter((e) => e.count > 0)

  const sorted = [...validEntries].sort((a, b) => {
    const pathCompare = a.filePath.localeCompare(b.filePath)
    if (pathCompare !== 0) return pathCompare
    return a.ruleName.localeCompare(b.ruleName)
  })

  return sorted
    .map((e) => `${e.filePath}\t${e.ruleName}\t${e.count}`)
    .join('\n')
}

/**
 * Read baseline entries from a file
 * Returns empty array if file does not exist
 */
export const readBaseline = (path: string): BaselineEntry[] => {
  if (!existsSync(path)) {
    return []
  }
  const content = readFileSync(path, 'utf-8')
  return parseBaselineTsv(content)
}

/**
 * Write baseline entries to a file
 * Creates parent directories if needed
 */
export const writeBaseline = (
  path: string,
  entries: BaselineEntry[]
): void => {
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true })
  const content = formatBaselineTsv(entries)
  writeFileSync(path, content, 'utf-8')
}

/**
 * Delete a baseline file if it exists
 */
export const deleteBaseline = (path: string): void => {
  if (existsSync(path)) {
    unlinkSync(path)
  }
}

/**
 * Write baseline entries to a path (absolute or relative).
 * If entries are empty or all have count 0, deletes the baseline file.
 * @deprecated Use writeBaselinesPerDirectory for per-directory baselines
 */
export const writePackageBaselineAt = (
  baselinePath: string,
  entries: BaselineEntry[]
): void => {
  const validEntries = entries.filter((entry) => entry.count > 0)
  if (validEntries.length === 0) {
    deleteBaseline(baselinePath)
  } else {
    writeBaseline(baselinePath, validEntries)
  }
}

// ============================================================================
// Per-Directory Baseline Functions
// ============================================================================

/**
 * Normalize a directory key to a canonical form for consistent Map lookups.
 * - Converts backslashes to forward slashes (Windows compatibility)
 * - Removes leading "./"
 * - Collapses redundant segments
 * - Returns "." for empty or root directory
 *
 * @param dir - Directory path to normalize
 * @returns Normalized directory path
 */
export const normalizeDirectoryKey = (dir: string): string => {
  // Convert backslashes to forward slashes
  let normalized = dir.replace(/\\/g, '/')

  // Remove leading "./"
  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2)
  }

  // Remove trailing slashes
  while (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1)
  }

  // Handle empty string or just "."
  if (normalized === '' || normalized === '.') {
    return '.'
  }

  return normalized
}

/**
 * Get the directory that should contain the baseline for a given file.
 * Returns the directory containing the file, normalized for consistent Map lookups.
 *
 * @param filePath - File path relative to package root (e.g., "src/db/foo.test.ts")
 * @returns Directory path relative to package root (e.g., "src/db")
 */
export const getBaselineDirectoryForFile = (
  filePath: string
): string => {
  const dir = dirname(filePath)
  return normalizeDirectoryKey(dir)
}

/**
 * Get the absolute path to the baseline file for a given directory within a package.
 *
 * @param repoRoot - Absolute path to repository root
 * @param packagePath - Package path relative to repo root (e.g., "platform/flowglad-next")
 * @param directory - Directory path relative to package root (e.g., "src/db")
 * @returns Absolute path to the baseline file
 */
export const getBaselinePathForDirectory = (
  repoRoot: string,
  packagePath: string,
  directory: string
): string => {
  return resolve(repoRoot, packagePath, directory, BASELINE_FILENAME)
}

/**
 * Find all baseline files in a package by walking the directory tree.
 *
 * @param repoRoot - Absolute path to repository root
 * @param packagePath - Package path relative to repo root
 * @returns Array of absolute paths to baseline files
 */
export const findAllBaselineFiles = (
  repoRoot: string,
  packagePath: string
): string[] => {
  const absolutePackagePath = resolve(repoRoot, packagePath)
  const baselineFiles: string[] = []

  const walk = (dir: string): void => {
    if (!existsSync(dir)) {
      return
    }

    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }

    for (const entry of entries) {
      // Skip common non-source directories
      if (
        entry === 'node_modules' ||
        entry === '.git' ||
        entry === 'dist' ||
        entry === '.next'
      ) {
        continue
      }

      const fullPath = join(dir, entry)

      if (entry === BASELINE_FILENAME) {
        baselineFiles.push(fullPath)
      } else {
        try {
          const stat = statSync(fullPath)
          if (stat.isDirectory()) {
            walk(fullPath)
          }
        } catch {
          // Can't stat, skip
        }
      }
    }
  }

  walk(absolutePackagePath)
  return baselineFiles
}

/**
 * Read all baseline entries for a package by aggregating all per-directory baseline files.
 *
 * @param repoRoot - Absolute path to repository root
 * @param packagePath - Package path relative to repo root
 * @returns Array of all baseline entries from all directories
 */
export const readAllBaselinesForPackage = (
  repoRoot: string,
  packagePath: string
): BaselineEntry[] => {
  const baselineFiles = findAllBaselineFiles(repoRoot, packagePath)
  const allEntries: BaselineEntry[] = []

  for (const baselinePath of baselineFiles) {
    const entries = readBaseline(baselinePath)
    allEntries.push(...entries)
  }

  return allEntries
}

/**
 * Group baseline entries by the directory they belong to.
 *
 * @param entries - Array of baseline entries with full file paths
 * @returns Map of directory path -> entries for that directory
 */
export const groupEntriesByDirectory = (
  entries: BaselineEntry[]
): Map<string, BaselineEntry[]> => {
  const grouped = new Map<string, BaselineEntry[]>()

  for (const entry of entries) {
    const directory = getBaselineDirectoryForFile(entry.filePath)
    const existing = grouped.get(directory) || []
    existing.push(entry)
    grouped.set(directory, existing)
  }

  return grouped
}

/**
 * Write baseline entries to per-directory files within a package.
 * Entries are grouped by directory and written to separate .lint-baseline.tsv files.
 * Directories that no longer have entries will have their baseline files deleted.
 *
 * @param repoRoot - Absolute path to repository root
 * @param packagePath - Package path relative to repo root
 * @param entries - All baseline entries to write
 * @param existingDirectories - Set of directories that previously had baselines (for cleanup)
 */
export const writeBaselinesPerDirectory = (
  repoRoot: string,
  packagePath: string,
  entries: BaselineEntry[],
  existingDirectories?: Set<string>
): void => {
  const validEntries = entries.filter((e) => e.count > 0)
  const grouped = groupEntriesByDirectory(validEntries)

  // Write baselines for each directory that has entries
  for (const [directory, dirEntries] of grouped) {
    const baselinePath = getBaselinePathForDirectory(
      repoRoot,
      packagePath,
      directory
    )
    writeBaseline(baselinePath, dirEntries)
  }

  // Delete baselines for directories that no longer have entries
  if (existingDirectories) {
    for (const directory of existingDirectories) {
      if (!grouped.has(directory)) {
        const baselinePath = getBaselinePathForDirectory(
          repoRoot,
          packagePath,
          directory
        )
        deleteBaseline(baselinePath)
      }
    }
  }
}

/**
 * Get the set of directories that currently have baseline files.
 *
 * @param repoRoot - Absolute path to repository root
 * @param packagePath - Package path relative to repo root
 * @returns Set of directory paths (relative to package root) that have baseline files
 */
export const getExistingBaselineDirectories = (
  repoRoot: string,
  packagePath: string
): Set<string> => {
  const absolutePackagePath = resolve(repoRoot, packagePath)
  const baselineFiles = findAllBaselineFiles(repoRoot, packagePath)
  const directories = new Set<string>()

  for (const baselinePath of baselineFiles) {
    // Get the directory containing the baseline file, relative to package root
    const baselineDir = dirname(baselinePath)
    const relativeDir =
      baselineDir === absolutePackagePath
        ? '.'
        : baselineDir.slice(absolutePackagePath.length + 1)
    // Normalize for consistent Map lookups
    directories.add(normalizeDirectoryKey(relativeDir))
  }

  return directories
}
