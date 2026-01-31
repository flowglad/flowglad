import { readBaseline } from '../baseline'
import { countViolationsByFile, runBiomeLint } from '../biome'
import {
  getBaselinePathForPackage,
  getFirstRule,
  loadConfig,
  resolvePackagePaths,
} from '../config'
import type { RatchetRule } from '../types'

export interface PackageStatus {
  packagePath: string
  baselineTotal: number
  currentTotal: number
  topOffenders: Array<{ file: string; count: number }>
}

/**
 * Format progress between baseline and current counts
 * Returns a string like "-8 (16.0% improvement)" or "+3 (regression)"
 */
const formatProgress = (
  baseline: number,
  current: number
): string => {
  const change = baseline - current
  if (change === 0) {
    return 'no change'
  }
  const percentage = ((Math.abs(change) / baseline) * 100).toFixed(1)
  if (change > 0) {
    return `-${change} (${percentage}% improvement)`
  }
  return `+${Math.abs(change)} (regression)`
}

/**
 * Get status for a single package
 */
const getPackageStatus = async (
  packagePath: string,
  rule: RatchetRule,
  exclude: string[]
): Promise<PackageStatus> => {
  // Get current violations
  const diagnostics = await runBiomeLint(
    packagePath,
    rule.filePatterns,
    rule.plugin,
    exclude
  )

  const currentCounts = countViolationsByFile(diagnostics, rule.name)

  // Get baseline
  const baselinePath = getBaselinePathForPackage(packagePath)
  const baselineEntries = readBaseline(baselinePath)

  // Calculate baseline total for this rule
  let baselineTotal = 0
  for (const entry of baselineEntries) {
    if (entry.ruleName === rule.name) {
      baselineTotal += entry.count
    }
  }

  // Calculate current total
  let currentTotal = 0
  for (const count of currentCounts.values()) {
    currentTotal += count
  }

  // Get top offenders (files with most current violations)
  const topOffenders = Array.from(currentCounts.entries())
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return {
    packagePath,
    baselineTotal,
    currentTotal,
    topOffenders,
  }
}

/**
 * Print status for a single package
 */
const printPackageStatus = (status: PackageStatus): void => {
  const { packagePath, baselineTotal, currentTotal, topOffenders } =
    status

  // Determine status icon
  let icon: string
  if (baselineTotal === 0 && currentTotal === 0) {
    icon = '✓'
  } else if (currentTotal === 0) {
    icon = '✓'
  } else if (currentTotal < baselineTotal) {
    icon = '↓'
  } else if (currentTotal === baselineTotal) {
    icon = '○'
  } else {
    icon = '↑'
  }

  console.log(`\n${icon} ${packagePath}`)

  if (baselineTotal === 0 && currentTotal === 0) {
    console.log('    Clean (no violations)')
    return
  }

  if (baselineTotal === 0 && currentTotal > 0) {
    console.log(
      `    No baseline yet: ${currentTotal} current violations`
    )
    console.log('    Run "lint:ratchet:init" to create baseline')
  } else if (currentTotal === 0) {
    console.log(
      `    Clean! Was ${baselineTotal} → now 0 (100% improvement)`
    )
  } else {
    console.log(
      `    ${baselineTotal} → ${currentTotal} (${formatProgress(baselineTotal, currentTotal)})`
    )
  }

  // Show top offenders
  if (topOffenders.length > 0) {
    console.log('    Top files:')
    for (const { file, count } of topOffenders) {
      console.log(`      ${count} violations: ${file}`)
    }
  }
}

/**
 * Main status command - shows progress metrics without failing
 */
export const statusCommand = async (): Promise<void> => {
  let config
  try {
    config = loadConfig()
  } catch {
    console.log('No .lint-ratchet.json config found.')
    console.log(
      'Run "lint:ratchet:init" to set up the ratchet system.'
    )
    return
  }

  const packages = resolvePackagePaths(config)

  if (packages.length === 0) {
    console.log('No packages configured in .lint-ratchet.json')
    return
  }

  const rule = getFirstRule(config)

  console.log(`Lint Ratchet Status: ${rule.name}`)
  console.log('─'.repeat(50))

  const packageStatuses: PackageStatus[] = []

  for (const pkg of packages) {
    const status = await getPackageStatus(
      pkg.path,
      rule,
      config.exclude
    )
    packageStatuses.push(status)
    printPackageStatus(status)
  }

  // Calculate totals
  let totalBaseline = 0
  let totalCurrent = 0

  for (const status of packageStatuses) {
    totalBaseline += status.baselineTotal
    totalCurrent += status.currentTotal
  }

  // Print summary
  console.log('\n' + '─'.repeat(50))
  console.log('Summary')

  if (totalBaseline === 0 && totalCurrent === 0) {
    console.log('  No violations found. All clean!')
  } else if (totalBaseline === 0) {
    console.log(
      `  No baseline yet. Current violations: ${totalCurrent}`
    )
    console.log(
      '  Run "lint:ratchet:init <rule-name>" to create baseline.'
    )
  } else {
    console.log(`  Baseline: ${totalBaseline} violations`)
    console.log(`  Current:  ${totalCurrent} violations`)
    console.log(
      `  Progress: ${formatProgress(totalBaseline, totalCurrent)}`
    )

    if (totalCurrent === 0) {
      console.log(
        '\n  All violations fixed! Consider promoting rule to biome.json.'
      )
    } else {
      const remaining = (
        (totalCurrent / totalBaseline) *
        100
      ).toFixed(1)
      console.log(`\n  ${remaining}% remaining to fix`)
    }
  }
}
