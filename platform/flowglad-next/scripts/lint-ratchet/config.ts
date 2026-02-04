import { existsSync, readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import type {
  PackageConfig,
  RatchetConfig,
  RatchetRule,
} from './types'

const DEFAULT_CONFIG_FILENAME = '.lint-ratchet.json'

/**
 * Find the repository root by looking for .git directory
 */
export const findRepoRoot = (
  startDir: string = process.cwd()
): string => {
  let dir = startDir
  let pastDir = ''
  while (dir !== pastDir) {
    if (existsSync(resolve(dir, '.git'))) {
      return dir
    }
    pastDir = dir
    dir = dirname(dir)
  }
  throw new Error(
    'Could not find repository root (no .git directory found)'
  )
}

/**
 * Get the default config file path (at repo root)
 */
export const getDefaultConfigPath = (): string => {
  const repoRoot = findRepoRoot()
  return resolve(repoRoot, DEFAULT_CONFIG_FILENAME)
}

/**
 * Validate that a config object has all required fields
 */
const validateConfig = (
  config: unknown,
  configPath: string
): RatchetConfig => {
  if (typeof config !== 'object' || config === null) {
    throw new Error(
      `Invalid config at ${configPath}: expected an object`
    )
  }

  const obj = config as Record<string, unknown>

  if (!Array.isArray(obj.rules)) {
    throw new Error(
      `Invalid config at ${configPath}: "rules" must be an array`
    )
  }

  if (!Array.isArray(obj.exclude)) {
    throw new Error(
      `Invalid config at ${configPath}: "exclude" must be an array`
    )
  }

  if (!Array.isArray(obj.packages)) {
    throw new Error(
      `Invalid config at ${configPath}: "packages" must be an array`
    )
  }

  for (let i = 0; i < obj.rules.length; i++) {
    const rule = obj.rules[i] as Record<string, unknown>
    if (typeof rule.name !== 'string') {
      throw new Error(
        `Invalid config at ${configPath}: rules[${i}].name must be a string`
      )
    }
    if (typeof rule.plugin !== 'string') {
      throw new Error(
        `Invalid config at ${configPath}: rules[${i}].plugin must be a string`
      )
    }
    if (!Array.isArray(rule.filePatterns)) {
      throw new Error(
        `Invalid config at ${configPath}: rules[${i}].filePatterns must be an array`
      )
    }
    if (rule.severity !== 'warn' && rule.severity !== 'off') {
      throw new Error(
        `Invalid config at ${configPath}: rules[${i}].severity must be "warn" or "off"`
      )
    }
  }

  for (let i = 0; i < obj.packages.length; i++) {
    const pkg = obj.packages[i] as Record<string, unknown>
    if (typeof pkg.path !== 'string') {
      throw new Error(
        `Invalid config at ${configPath}: packages[${i}].path must be a string`
      )
    }
  }

  return config as RatchetConfig
}

/**
 * Load and validate config from a JSON file
 */
export const loadConfig = (configPath?: string): RatchetConfig => {
  const path = configPath ?? getDefaultConfigPath()

  if (!existsSync(path)) {
    throw new Error(
      `Config file not found at ${path}. Run "lint:ratchet:init" to create one.`
    )
  }

  const content = readFileSync(path, 'utf-8')
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    throw new Error(
      `Failed to parse config at ${path}: ${e instanceof Error ? e.message : String(e)}`
    )
  }

  return validateConfig(parsed, path)
}

/**
 * Resolve package paths to absolute paths, filtering out non-existent packages
 */
export const resolvePackagePaths = (
  config: RatchetConfig
): PackageConfig[] => {
  const repoRoot = findRepoRoot()
  const resolved: PackageConfig[] = []

  for (const pkg of config.packages) {
    const absolutePath = resolve(repoRoot, pkg.path)
    if (existsSync(absolutePath)) {
      resolved.push({ path: pkg.path })
    } else {
      console.warn(
        `Warning: Package path "${pkg.path}" does not exist, skipping`
      )
    }
  }

  return resolved
}

/**
 * Get the baseline file path for a package (legacy single-file format).
 * @deprecated Use per-directory baselines instead via baseline.ts functions
 */
export const getBaselinePathForPackage = (
  packagePath: string
): string => {
  const repoRoot = findRepoRoot()
  return resolve(repoRoot, packagePath, '.lint-baseline.tsv')
}

/**
 * Get the first rule from config with validation.
 * Currently only one rule is supported at a time.
 * Throws with a clear error message if no rules are configured.
 */
export const getFirstRule = (config: RatchetConfig): RatchetRule => {
  if (config.rules.length === 0) {
    throw new Error(
      'No rules configured in .lint-ratchet.json. ' +
        'Add a rule to the "rules" array in your config file.'
    )
  }

  const rule = config.rules[0]

  // Log if there are multiple rules (only first is used)
  if (config.rules.length > 1) {
    console.warn(
      `Warning: Multiple rules configured (${config.rules.map((r) => r.name).join(', ')}). ` +
        `Currently only one rule is supported at a time. Using "${rule.name}".`
    )
  }

  return rule
}
