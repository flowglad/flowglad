import { createInterface } from 'readline'
import { readBaseline, writePackageBaselineAt } from '../baseline'
import { countViolationsByFile, runBiomeLint } from '../biome'
import {
  getBaselinePathForPackage as getBaselinePathAbsolute,
  loadConfig,
  resolvePackagePaths,
} from '../config'
import type { BaselineEntry, RatchetRule } from '../types'

export interface InitOptions {
  force?: boolean
  package?: string
}

/**
 * Prompt user for confirmation (y/N). Returns true if user confirms.
 */
const promptConfirm = (message: string): Promise<boolean> => {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  return new Promise((resolveConfirm) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close()
      const normalized = answer.trim().toLowerCase()
      resolveConfirm(normalized === 'y' || normalized === 'yes')
    })
  })
}

/**
 * Compute new baseline entries for a package: keep entries for other rules,
 * replace entries for the given rule with current violation counts.
 * Removes entries for files that no longer exist (not in currentCounts).
 */
const computeNewEntries = (
  existingEntries: BaselineEntry[],
  rule: RatchetRule,
  currentCounts: Map<string, number>
): BaselineEntry[] => {
  const otherRuleEntries = existingEntries.filter(
    (e) => e.ruleName !== rule.name
  )
  const newEntriesForRule: BaselineEntry[] = []
  for (const [filePath, count] of currentCounts) {
    if (count > 0) {
      newEntriesForRule.push({
        filePath,
        ruleName: rule.name,
        count,
      })
    }
  }
  return [...otherRuleEntries, ...newEntriesForRule]
}

/**
 * Show diff of baseline changes for a package
 */
const printBaselineDiff = (
  packagePath: string,
  ruleName: string,
  existingEntries: BaselineEntry[],
  newEntries: BaselineEntry[]
): void => {
  const existingForRule = new Map(
    existingEntries
      .filter((e) => e.ruleName === ruleName)
      .map((e) => [e.filePath, e.count])
  )
  const newForRule = new Map(
    newEntries
      .filter((e) => e.ruleName === ruleName)
      .map((e) => [e.filePath, e.count])
  )

  const added: Array<{ path: string; count: number }> = []
  const changed: Array<{
    path: string
    old: number
    new: number
  }> = []
  const removed: Array<{ path: string; count: number }> = []

  for (const [path, count] of newForRule) {
    const oldCount = existingForRule.get(path)
    if (oldCount === undefined) {
      added.push({ path, count })
    } else if (oldCount !== count) {
      changed.push({ path, old: oldCount, new: count })
    }
  }
  for (const [path, count] of existingForRule) {
    if (!newForRule.has(path)) {
      removed.push({ path, count })
    }
  }

  if (
    added.length === 0 &&
    changed.length === 0 &&
    removed.length === 0
  ) {
    return
  }

  console.log(`\n  ${packagePath}:`)
  if (added.length > 0) {
    for (const { path, count } of added) {
      console.log(`    + ${path}: ${count}`)
    }
  }
  if (changed.length > 0) {
    for (const { path, old, new: newCount } of changed) {
      console.log(`    ~ ${path}: ${old} → ${newCount}`)
    }
  }
  if (removed.length > 0) {
    for (const { path, count } of removed) {
      console.log(`    - ${path}: ${count}`)
    }
  }
}

/**
 * Initialize or update baseline for a specific rule, per package.
 * With --package, only the specified package is updated.
 * When baseline already exists, prompts for confirmation unless --force.
 */
export const initCommand = async (
  ruleName: string,
  options: InitOptions = {}
): Promise<void> => {
  const config = loadConfig()
  const rule = config.rules.find((r) => r.name === ruleName)
  if (!rule) {
    throw new Error(
      `Rule "${ruleName}" not found in config. Available rules: ${config.rules.map((r) => r.name).join(', ')}`
    )
  }

  let packages = resolvePackagePaths(config)
  if (options.package) {
    packages = packages.filter((p) => p.path === options.package)
    if (packages.length === 0) {
      throw new Error(
        `Package "${options.package}" not found or not in config.`
      )
    }
  }

  // First pass: collect current counts and new entries per package
  type PackagePlan = {
    packagePath: string
    absoluteBaselinePath: string
    existingEntries: BaselineEntry[]
    newEntries: BaselineEntry[]
    currentCounts: Map<string, number>
  }

  const plans: PackagePlan[] = []

  for (const pkg of packages) {
    const diagnostics = await runBiomeLint(
      pkg.path,
      rule.filePatterns,
      rule.plugin,
      config.exclude
    )
    const currentCounts = countViolationsByFile(
      diagnostics,
      rule.name
    )
    const absoluteBaselinePath = getBaselinePathAbsolute(pkg.path)
    const existingEntries = readBaseline(absoluteBaselinePath)
    const newEntries = computeNewEntries(
      existingEntries,
      rule,
      currentCounts
    )

    plans.push({
      packagePath: pkg.path,
      absoluteBaselinePath,
      existingEntries,
      newEntries,
      currentCounts,
    })
  }

  // Check if any package has an existing baseline with entries for this rule
  const anyExistingBaseline = plans.some(
    (p) =>
      p.existingEntries.length > 0 &&
      p.existingEntries.some((e) => e.ruleName === rule.name)
  )

  if (anyExistingBaseline && !options.force) {
    const confirmed = await promptConfirm(
      'Baseline(s) already exist for this rule. Overwrite?'
    )
    if (!confirmed) {
      console.log('Aborted.')
      return
    }
  }

  console.log(`Initializing baseline for rule: ${ruleName}`)
  if (options.package) {
    console.log(`Package: ${options.package}`)
  }

  for (const plan of plans) {
    printBaselineDiff(
      plan.packagePath,
      rule.name,
      plan.existingEntries,
      plan.newEntries
    )

    const entriesForThisRule = plan.newEntries.filter(
      (e) => e.ruleName === rule.name
    )
    const hadBaseline = plan.existingEntries.length > 0
    writePackageBaselineAt(plan.absoluteBaselinePath, plan.newEntries)
    if (plan.newEntries.length === 0) {
      if (hadBaseline) {
        console.log(
          `\n  ${plan.packagePath}: removed baseline (no violations)`
        )
      }
    } else {
      const total = plan.newEntries
        .filter((e) => e.ruleName === rule.name)
        .reduce((sum, e) => sum + e.count, 0)
      console.log(
        `\n  ${plan.packagePath}: wrote baseline (${entriesForThisRule.length} files, ${total} violations)`
      )
    }
  }

  console.log('\nDone.')
}
