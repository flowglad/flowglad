import { spawnSync } from 'child_process'
import { randomUUID } from 'crypto'
import { unlinkSync, writeFileSync } from 'fs'
import { relative, resolve } from 'path'
import { findRepoRoot } from './config'
import type { BiomeDiagnostic } from './types'

/**
 * Biome JSON reporter output structure
 */
interface BiomeJsonOutput {
  summary: {
    changed: number
    unchanged: number
    errors: number
    warnings: number
    infos: number
  }
  diagnostics: BiomeJsonDiagnostic[]
  command: string
}

interface BiomeJsonDiagnostic {
  category: string
  severity: 'error' | 'warning' | 'info'
  description: string
  message: Array<{ content: string }>
  advices: {
    advices: unknown[]
  }
  verboseAdvices: {
    advices: unknown[]
  }
  location: {
    path?: {
      file: string
    }
    span?: [number, number]
    sourceCode?: string
  }
  tags: string[]
  source: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isBiomeJsonOutput = (
  value: unknown
): value is BiomeJsonOutput =>
  isRecord(value) &&
  isRecord(value.summary) &&
  Array.isArray(value.diagnostics) &&
  typeof value.command === 'string'

/**
 * Convert line/column from source position
 * This is a simplified approach - we use the file path and estimate line number
 */
const getLineNumber = (
  sourceCode: string | undefined,
  span: [number, number] | undefined
): number => {
  if (!sourceCode || !span) {
    return 1
  }
  const beforeSpan = sourceCode.slice(0, span[0])
  return (beforeSpan.match(/\n/g) || []).length + 1
}

/**
 * Run Biome lint on a package with a specific plugin
 * Returns diagnostics filtered to the specified plugin
 */
export const runBiomeLint = async (
  packagePath: string,
  filePatterns: string[],
  pluginPath: string,
  exclude: string[]
): Promise<BiomeDiagnostic[]> => {
  const repoRoot = findRepoRoot()
  const absolutePackagePath = resolve(repoRoot, packagePath)
  const absolutePluginPath = resolve(repoRoot, pluginPath)

  // Create a temporary biome config that only uses the specified plugin
  // Note: We pass the package directory to biome (not glob patterns) and let
  // overrides.includes filter which files the plugin applies to
  const tempConfig = {
    $schema:
      './node_modules/@biomejs/biome/configuration_schema.json',
    linter: {
      enabled: true,
      rules: {
        recommended: false,
      },
    },
    overrides: [
      {
        includes: filePatterns,
        plugins: [absolutePluginPath],
      },
    ],
  }

  // Write temp config
  const tempConfigPath = resolve(
    repoRoot,
    `.lint-ratchet-temp-${process.pid}-${Date.now()}-${randomUUID()}.json`
  )
  writeFileSync(tempConfigPath, JSON.stringify(tempConfig, null, 2))

  try {
    // Run biome lint with JSON reporter
    const result = spawnSync(
      'bunx',
      [
        'biome',
        'lint',
        '--reporter=json',
        `--config-path=${tempConfigPath}`,
        absolutePackagePath,
      ],
      {
        cwd: repoRoot,
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large outputs
      }
    )
    if (result.error) {
      throw new Error(`Failed to run Biome: ${result.error.message}`)
    }
    // Biome exits with 1 when there are lint errors, which is expected
    const output = [result.stdout, result.stderr]
      .filter((chunk) => chunk && chunk.length > 0)
      .join('\n')

    // Parse JSON output (Biome prints a single JSON object, often multi-line)
    const trimmed = output.trim()
    let biomeOutput: BiomeJsonOutput | null = null

    if (trimmed.startsWith('{')) {
      try {
        const parsed: unknown = JSON.parse(trimmed)
        if (isBiomeJsonOutput(parsed)) {
          biomeOutput = parsed
        }
      } catch {
        biomeOutput = null
      }
    }

    if (!biomeOutput) {
      const firstBrace = output.indexOf('{')
      const lastBrace = output.lastIndexOf('}')
      if (
        firstBrace !== -1 &&
        lastBrace !== -1 &&
        lastBrace > firstBrace
      ) {
        const jsonSlice = output.slice(firstBrace, lastBrace + 1)
        try {
          const parsed: unknown = JSON.parse(jsonSlice)
          if (isBiomeJsonOutput(parsed)) {
            biomeOutput = parsed
          }
        } catch {
          biomeOutput = null
        }
      }
    }

    if (!biomeOutput) {
      // No JSON output means no diagnostics or an error
      if (result.stderr && !result.stderr.includes('unstable')) {
        throw new Error(`Biome failed with stderr: ${result.stderr}`)
      }
      return []
    }

    // Convert Biome diagnostics to our format
    const diagnostics: BiomeDiagnostic[] = []

    for (const diag of biomeOutput.diagnostics) {
      if (!diag.location?.path?.file) {
        continue
      }

      const filePath = diag.location.path.file
      // Biome returns paths relative to cwd (repo root), resolve to absolute first
      const absoluteFilePath = resolve(repoRoot, filePath)
      // Make path relative to package
      const relativeFilePath = relative(
        absolutePackagePath,
        absoluteFilePath
      )

      // Skip files outside the package
      if (relativeFilePath.startsWith('..')) {
        continue
      }

      // Skip excluded files (simple glob: **/, /** and *.suffix)
      const shouldExclude = exclude.some((pattern) => {
        // Pattern starts with **/ — strip and match rest anywhere in path
        if (pattern.startsWith('**/')) {
          const rest = pattern.slice(3)
          if (rest.endsWith('/**')) {
            const prefix = rest.slice(0, -3)
            return relativeFilePath.includes(prefix)
          }
          if (rest.startsWith('*') && rest.indexOf('*', 1) === -1) {
            return relativeFilePath.endsWith(rest.slice(1))
          }
          return (
            relativeFilePath === rest ||
            relativeFilePath.endsWith(`/${rest}`) ||
            relativeFilePath.includes(`/${rest}/`)
          )
        }
        // Pattern ends with /** and no leading **/ — match path prefix
        if (pattern.endsWith('/**')) {
          const prefix = pattern.slice(0, -3)
          return relativeFilePath.startsWith(prefix)
        }
        // Fallback: strip ** and match; if result contains * treat as *.suffix
        const cleaned = pattern.replace(/\*\*/g, '')
        if (
          cleaned.startsWith('*') &&
          cleaned.indexOf('*', 1) === -1
        ) {
          return relativeFilePath.endsWith(cleaned.slice(1))
        }
        return relativeFilePath.includes(cleaned)
      })

      if (shouldExclude) {
        continue
      }

      const message =
        diag.message?.map((m) => m.content).join('') ||
        diag.description ||
        ''

      diagnostics.push({
        filePath: relativeFilePath,
        category: diag.category,
        message,
        line: getLineNumber(
          diag.location.sourceCode,
          diag.location.span
        ),
      })
    }

    return diagnostics
  } finally {
    // Clean up temp config
    try {
      unlinkSync(tempConfigPath)
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Check if a diagnostic category matches a rule name.
 * Uses suffix matching (endsWith) rather than substring includes to avoid
 * collisions between rule names (e.g., "no-any" vs "no-explicit-any").
 *
 * Matching rules:
 * 1. Exact match: `lint/plugin/<ruleName>`
 * 2. Suffix match: category ends with `/<ruleName>` (for variations)
 * 3. Fallback: category is exactly 'plugin' (some Biome versions emit this)
 */
export const matchesRuleCategory = (
  category: string,
  ruleName: string
): boolean => {
  const expectedCategory = `lint/plugin/${ruleName}`

  return (
    category === expectedCategory ||
    category.endsWith(`/${ruleName}`) ||
    category === 'plugin'
  )
}

/**
 * Count violations by file for a specific rule
 * Returns a Map of file path (relative to package) -> violation count
 */
export const countViolationsByFile = (
  diagnostics: BiomeDiagnostic[],
  ruleName: string
): Map<string, number> => {
  const counts = new Map<string, number>()

  for (const diag of diagnostics) {
    if (matchesRuleCategory(diag.category, ruleName)) {
      const current = counts.get(diag.filePath) || 0
      counts.set(diag.filePath, current + 1)
    }
  }

  return counts
}

/**
 * Get diagnostics for a specific file and rule
 */
export const getDiagnosticsForFile = (
  diagnostics: BiomeDiagnostic[],
  filePath: string,
  ruleName: string
): BiomeDiagnostic[] => {
  return diagnostics.filter(
    (diag) =>
      diag.filePath === filePath &&
      matchesRuleCategory(diag.category, ruleName)
  )
}
