import { readAllBaselinesForPackage } from '../baseline'
import {
  countViolationsByFile,
  getDiagnosticsForFile,
  runBiomeLint,
} from '../biome'
import {
  findRepoRoot,
  getFirstRule,
  loadConfig,
  resolvePackagePaths,
} from '../config'
import type { BiomeDiagnostic, RatchetRule } from '../types'

export interface FileCheckResult {
  path: string
  baseline: number
  current: number
  violations: BiomeDiagnostic[]
}

export interface PackageCheckResult {
  packagePath: string
  passed: boolean
  filesWithNewViolations: FileCheckResult[]
  filesAtLimit: Array<{ path: string; count: number }>
  filesImproved: Array<{
    path: string
    baseline: number
    current: number
  }>
}

export interface CheckSummary {
  rule: string
  passed: boolean
  packages: PackageCheckResult[]
  totals: {
    baselineTotal: number
    currentTotal: number
    filesWithNewViolations: number
    filesImproved: number
  }
}

/**
 * Check a single package against its baseline for a specific rule
 */
const checkPackageForRule = async (
  packagePath: string,
  rule: RatchetRule,
  exclude: string[],
  repoRoot: string
): Promise<PackageCheckResult> => {
  // Get current violations
  const diagnostics = await runBiomeLint(
    packagePath,
    rule.filePatterns,
    rule.plugin,
    exclude
  )

  const currentCounts = countViolationsByFile(diagnostics, rule.name)

  // Get baseline from all per-directory baseline files
  const baselineEntries = readAllBaselinesForPackage(
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

  // Compare current vs baseline
  const filesWithNewViolations: FileCheckResult[] = []
  const filesAtLimit: Array<{ path: string; count: number }> = []
  const filesImproved: Array<{
    path: string
    baseline: number
    current: number
  }> = []

  // Check all files that currently have violations
  for (const [filePath, currentCount] of currentCounts) {
    const baselineCount = baselineMap.get(filePath) ?? 0

    if (currentCount > baselineCount) {
      const fileDiagnostics = getDiagnosticsForFile(
        diagnostics,
        filePath,
        rule.name
      )
      filesWithNewViolations.push({
        path: filePath,
        baseline: baselineCount,
        current: currentCount,
        violations: fileDiagnostics,
      })
    } else if (currentCount === baselineCount && currentCount > 0) {
      // At the limit - warn but don't fail
      filesAtLimit.push({ path: filePath, count: currentCount })
    } else if (currentCount < baselineCount) {
      // Improved!
      filesImproved.push({
        path: filePath,
        baseline: baselineCount,
        current: currentCount,
      })
    }
  }

  // Check for files in baseline that no longer have violations
  for (const [filePath, baselineCount] of baselineMap) {
    if (!currentCounts.has(filePath) && baselineCount > 0) {
      filesImproved.push({
        path: filePath,
        baseline: baselineCount,
        current: 0,
      })
    }
  }

  const passed = filesWithNewViolations.length === 0

  return {
    packagePath,
    passed,
    filesWithNewViolations,
    filesAtLimit,
    filesImproved,
  }
}

interface PrintOptions {
  verbose: boolean
}

const MAX_FILES_TO_SHOW = 5

/**
 * Print results for a single package
 */
const printPackageResult = (
  result: PackageCheckResult,
  ruleName: string,
  options: PrintOptions
): void => {
  const status = result.passed ? '✓' : '✗'
  console.log(`\n${status} ${result.packagePath}`)

  if (result.filesWithNewViolations.length > 0) {
    console.log(`\n  Files exceeding baseline (${ruleName}):`)
    for (const file of result.filesWithNewViolations) {
      console.log(
        `    ✗ ${file.path}: ${file.baseline} → ${file.current} (+${file.current - file.baseline})`
      )
      for (const diag of file.violations) {
        console.log(`      Line ${diag.line}: ${diag.message}`)
      }
    }
  }

  if (result.filesAtLimit.length > 0) {
    console.log(`\n  At baseline limit (warnings):`)
    const filesToShow = options.verbose
      ? result.filesAtLimit
      : result.filesAtLimit.slice(0, MAX_FILES_TO_SHOW)
    for (const file of filesToShow) {
      console.log(`    ⚠ ${file.path}: ${file.count} violations`)
    }
    if (
      !options.verbose &&
      result.filesAtLimit.length > MAX_FILES_TO_SHOW
    ) {
      console.log(
        `    ... and ${result.filesAtLimit.length - MAX_FILES_TO_SHOW} more files at limit`
      )
    }
  }

  if (result.filesImproved.length > 0) {
    console.log(`\n  Improved:`)
    const filesToShow = options.verbose
      ? result.filesImproved
      : result.filesImproved.slice(0, MAX_FILES_TO_SHOW)
    for (const file of filesToShow) {
      console.log(
        `    ↓ ${file.path}: ${file.baseline} → ${file.current}`
      )
    }
    if (
      !options.verbose &&
      result.filesImproved.length > MAX_FILES_TO_SHOW
    ) {
      console.log(
        `    ... and ${result.filesImproved.length - MAX_FILES_TO_SHOW} more files improved`
      )
    }
  }
}

export interface CheckCommandOptions {
  verbose?: boolean
}

/**
 * Main check command - compares current violations to baseline across all packages
 */
export const checkCommand = async (
  options: CheckCommandOptions = {}
): Promise<{
  passed: boolean
  summary: CheckSummary
}> => {
  const { verbose = false } = options
  const config = loadConfig()
  const packages = resolvePackagePaths(config)
  const repoRoot = findRepoRoot()

  if (packages.length === 0) {
    console.error('No packages found to check')
    return {
      passed: false,
      summary: {
        rule: '',
        passed: false,
        packages: [],
        totals: {
          baselineTotal: 0,
          currentTotal: 0,
          filesWithNewViolations: 0,
          filesImproved: 0,
        },
      },
    }
  }

  const rule = getFirstRule(config)

  console.log(`Checking rule: ${rule.name}`)
  console.log(`Packages: ${packages.map((p) => p.path).join(', ')}`)

  const packageResults: PackageCheckResult[] = []

  for (const pkg of packages) {
    const result = await checkPackageForRule(
      pkg.path,
      rule,
      config.exclude,
      repoRoot
    )
    packageResults.push(result)
    printPackageResult(result, rule.name, { verbose })
  }

  // Calculate totals
  let baselineTotal = 0
  let currentTotal = 0
  let filesWithNewViolations = 0
  let filesImproved = 0

  for (const pkg of packageResults) {
    for (const file of pkg.filesWithNewViolations) {
      baselineTotal += file.baseline
      currentTotal += file.current
      filesWithNewViolations++
    }
    for (const file of pkg.filesAtLimit) {
      baselineTotal += file.count
      currentTotal += file.count
    }
    for (const file of pkg.filesImproved) {
      baselineTotal += file.baseline
      currentTotal += file.current
      filesImproved++
    }
  }

  const allPassed = packageResults.every((r) => r.passed)

  // Print summary
  console.log('\n' + '─'.repeat(50))
  if (allPassed) {
    console.log('✓ All packages passed ratchet check')
  } else {
    console.log('✗ Ratchet check failed')
    console.log(
      `  ${filesWithNewViolations} file(s) have new violations above baseline`
    )
  }

  if (baselineTotal > 0) {
    const improvement = baselineTotal - currentTotal
    const percentage =
      improvement > 0
        ? ((improvement / baselineTotal) * 100).toFixed(1)
        : '0'
    console.log(
      `  Total: ${baselineTotal} → ${currentTotal} (${improvement >= 0 ? '-' : '+'}${Math.abs(improvement)}, ${percentage}% improvement)`
    )
  }

  if (filesImproved > 0) {
    console.log(`  ${filesImproved} file(s) improved`)
  }

  return {
    passed: allPassed,
    summary: {
      rule: rule.name,
      passed: allPassed,
      packages: packageResults,
      totals: {
        baselineTotal,
        currentTotal,
        filesWithNewViolations,
        filesImproved,
      },
    },
  }
}
