import {
  getExistingBaselineDirectories,
  readAllBaselinesForPackage,
  writeBaselinesPerDirectory,
} from '../baseline'
import { countViolationsByFile, runBiomeLint } from '../biome'
import {
  findRepoRoot,
  getFirstRule,
  loadConfig,
  resolvePackagePaths,
} from '../config'
import type { BaselineEntry, RatchetRule } from '../types'

export interface FileChange {
  file: string
  old: number
  new: number
}

export interface PackageUpdateResult {
  packagePath: string
  updated: boolean
  changes: FileChange[]
}

export interface UpdateResult {
  updated: boolean
  packageChanges: PackageUpdateResult[]
}

/**
 * Update baseline for a single package by ratcheting down counts
 * Throws immediately if any violation count increased
 */
const updatePackageBaseline = async (
  packagePath: string,
  rule: RatchetRule,
  exclude: string[],
  repoRoot: string
): Promise<PackageUpdateResult> => {
  // Get current violations
  const diagnostics = await runBiomeLint(
    packagePath,
    rule.filePatterns,
    rule.plugin,
    exclude
  )

  const currentCounts = countViolationsByFile(diagnostics, rule.name)

  // Get existing baseline from all per-directory baseline files
  const baselineEntries = readAllBaselinesForPackage(
    repoRoot,
    packagePath
  )
  const existingDirectories = getExistingBaselineDirectories(
    repoRoot,
    packagePath
  )

  // Build baseline map for this rule
  const baselineMap = new Map<string, number>()
  for (const entry of baselineEntries) {
    if (entry.ruleName === rule.name) {
      baselineMap.set(entry.filePath, entry.count)
    }
  }

  // Track changes
  const changes: FileChange[] = []

  // Build new baseline entries
  const newEntries: BaselineEntry[] = []

  // Keep entries for other rules unchanged
  for (const entry of baselineEntries) {
    if (entry.ruleName !== rule.name) {
      newEntries.push(entry)
    }
  }

  // Process all files that have current violations
  for (const [filePath, currentCount] of currentCounts) {
    const baselineCount = baselineMap.get(filePath) ?? 0

    if (currentCount > baselineCount) {
      // Violations increased - fail fast
      throw new Error(
        `Baseline update failed: violations increased in ${packagePath}/${filePath} ` +
          `(${baselineCount} → ${currentCount}, +${currentCount - baselineCount}). ` +
          `This can happen if: (1) code changed between CI check and baseline update, ` +
          `(2) the check command was not run before update, or ` +
          `(3) the baseline file was manually modified. ` +
          `Run "lint:ratchet" first to verify violations are within baseline.`
      )
    }

    if (currentCount < baselineCount) {
      // Violations decreased - ratchet down
      changes.push({
        file: filePath,
        old: baselineCount,
        new: currentCount,
      })
    }

    // Add entry only if count > 0
    if (currentCount > 0) {
      newEntries.push({
        filePath,
        ruleName: rule.name,
        count: currentCount,
      })
    }
  }

  // Check for files that were in baseline but no longer have violations
  for (const [filePath, baselineCount] of baselineMap) {
    if (!currentCounts.has(filePath) && baselineCount > 0) {
      // File was removed or no longer has violations
      changes.push({
        file: filePath,
        old: baselineCount,
        new: 0,
      })
    }
  }

  // Write if there were changes (writes to per-directory baseline files)
  if (changes.length > 0) {
    writeBaselinesPerDirectory(
      repoRoot,
      packagePath,
      newEntries,
      existingDirectories
    )
  }

  return {
    packagePath,
    updated: changes.length > 0,
    changes,
  }
}

/**
 * Print results for a single package update
 */
const printPackageUpdateResult = (
  result: PackageUpdateResult
): void => {
  if (!result.updated) {
    console.log(`\n○ ${result.packagePath} (no changes)`)
    return
  }

  console.log(`\n✓ ${result.packagePath}`)

  if (result.changes.length > 0) {
    console.log('  Updated:')
    for (const change of result.changes.slice(0, 10)) {
      if (change.new === 0) {
        console.log(`    ↓ ${change.file}: ${change.old} → removed`)
      } else {
        console.log(
          `    ↓ ${change.file}: ${change.old} → ${change.new}`
        )
      }
    }
    if (result.changes.length > 10) {
      console.log(
        `    ... and ${result.changes.length - 10} more files`
      )
    }
  }
}

/**
 * Main update command - ratchets down baselines across all packages
 * Only decreases counts, never increases.
 * Throws if any violations increased (should not happen post-CI).
 */
export const updateCommand = async (): Promise<UpdateResult> => {
  const config = loadConfig()
  const packages = resolvePackagePaths(config)
  const repoRoot = findRepoRoot()

  if (packages.length === 0) {
    console.error('No packages found to update')
    return {
      updated: false,
      packageChanges: [],
    }
  }

  const rule = getFirstRule(config)

  console.log(`Updating baselines for rule: ${rule.name}`)
  console.log(`Packages: ${packages.map((p) => p.path).join(', ')}`)

  const packageResults: PackageUpdateResult[] = []

  for (const pkg of packages) {
    const result = await updatePackageBaseline(
      pkg.path,
      rule,
      config.exclude,
      repoRoot
    )
    packageResults.push(result)
    printPackageUpdateResult(result)
  }

  // Calculate summary
  const anyUpdated = packageResults.some((r) => r.updated)

  let totalOld = 0
  let totalNew = 0
  let totalFilesChanged = 0

  for (const pkg of packageResults) {
    for (const change of pkg.changes) {
      totalOld += change.old
      totalNew += change.new
      totalFilesChanged++
    }
  }

  // Print summary
  console.log('\n' + '─'.repeat(50))

  if (anyUpdated) {
    const reduction = totalOld - totalNew
    console.log('✓ Baselines updated')
    console.log(`  ${totalFilesChanged} file(s) changed`)
    console.log(
      `  Total violations: ${totalOld} → ${totalNew} (-${reduction})`
    )
  } else {
    console.log('○ No baseline changes needed')
    console.log('  All files are at or below their baseline counts.')
  }

  return {
    updated: anyUpdated,
    packageChanges: packageResults,
  }
}
