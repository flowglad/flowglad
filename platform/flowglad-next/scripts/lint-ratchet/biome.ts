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

  // Build file paths to lint (relative to package)
  const filesToLint = filePatterns.map((pattern) =>
    resolve(absolutePackagePath, pattern)
  )

  // Create a temporary biome config that only uses the specified plugin
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
        ...filesToLint,
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
    const output = result.stdout || ''

    // Parse JSON output (skip the warning line about unstable JSON)
    const jsonLines = output.split('\n').filter((line) => {
      try {
        JSON.parse(line)
        return true
      } catch {
        return false
      }
    })

    if (jsonLines.length === 0) {
      // No JSON output means no diagnostics or an error
      if (result.stderr && !result.stderr.includes('unstable')) {
        throw new Error(`Biome failed with stderr: ${result.stderr}`)
      }
      return []
    }

    const biomeOutput: BiomeJsonOutput = JSON.parse(jsonLines[0])

    // Convert Biome diagnostics to our format
    const diagnostics: BiomeDiagnostic[] = []

    for (const diag of biomeOutput.diagnostics) {
      if (!diag.location?.path?.file) {
        continue
      }

      const absoluteFilePath = diag.location.path.file
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
 * Count violations by file for a specific rule
 * Returns a Map of file path (relative to package) -> violation count
 */
export const countViolationsByFile = (
  diagnostics: BiomeDiagnostic[],
  ruleName: string
): Map<string, number> => {
  const counts = new Map<string, number>()

  // The category format for GritQL plugins is "lint/plugin/<rule-name>"
  const expectedCategory = `lint/plugin/${ruleName}`

  for (const diag of diagnostics) {
    // Match either exact category or category that contains the rule name
    if (
      diag.category === expectedCategory ||
      diag.category.includes(ruleName)
    ) {
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
  const expectedCategory = `lint/plugin/${ruleName}`

  return diagnostics.filter(
    (diag) =>
      diag.filePath === filePath &&
      (diag.category === expectedCategory ||
        diag.category.includes(ruleName))
  )
}
