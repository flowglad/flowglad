import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { dirname } from 'path'
import type {
  BaselineEntry,
  PackageBaseline,
  RatchetConfig,
} from './types'

const BASELINE_FILENAME = '.lint-baseline.tsv'

/**
 * Get the path to the baseline file for a package
 */
export const getBaselinePathForPackage = (
  packagePath: string
): string => {
  return `${packagePath}/${BASELINE_FILENAME}`
}

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
 * Read baselines from all configured packages
 */
export const readAllPackageBaselines = (
  config: RatchetConfig
): PackageBaseline[] => {
  return config.packages.map((pkg) => {
    const baselinePath = getBaselinePathForPackage(pkg.path)
    const entries = readBaseline(baselinePath)
    return {
      packagePath: pkg.path,
      baselinePath,
      entries,
    }
  })
}

/**
 * Write baseline entries for a specific package
 * If entries is empty, deletes the baseline file
 */
export const writePackageBaseline = (
  packagePath: string,
  entries: BaselineEntry[]
): void => {
  const baselinePath = getBaselinePathForPackage(packagePath)
  const validEntries = entries.filter((entry) => entry.count > 0)
  if (validEntries.length === 0) {
    deleteBaseline(baselinePath)
  } else {
    writeBaseline(baselinePath, validEntries)
  }
}
