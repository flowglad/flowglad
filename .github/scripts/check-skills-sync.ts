#!/usr/bin/env bun
/**
 * CI Script: Check Skills Sync
 *
 * This script ensures that when documentation files change, the corresponding
 * skills that reference those docs are either updated or have their
 * `sources_reviewed` timestamp bumped to confirm they're still accurate.
 *
 * Exit codes:
 *   0 - Success (no issues found)
 *   1 - Skill sync check failed
 */

import { spawnSync } from 'child_process'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, relative } from 'path'

export interface SkillMetadata {
  sourcesReviewed: string
  sourceFiles: string[]
  path: string
  name: string
}

export interface InvalidSkill {
  path: string
  absolutePath: string
  reason: string
}

export interface SkillDiscoveryResult {
  valid: SkillMetadata[]
  invalid: InvalidSkill[]
}

interface SyncError {
  doc: string
  skill: string
  skillPath: string
  message: string
}

interface TimestampCheckResult {
  updated: boolean
  validationError?: string
}

/**
 * Validates a timestamp value.
 * - Must be valid ISO 8601 format
 * - Must be later than the previous timestamp (if provided)
 * - Must not be in the future (with 10 second grace period)
 */
export function validateTimestamp(
  newTimestamp: string,
  oldTimestamp: string | null
): string | undefined {
  const newDate = new Date(newTimestamp)

  // Check if valid date
  if (isNaN(newDate.getTime())) {
    return `Invalid timestamp format: "${newTimestamp}". Use ISO 8601 format (e.g., 2026-01-21T12:00:00Z)`
  }

  // Check not in future (with 10 second grace period for CI timing)
  const maxTime = Date.now() + 10000
  if (newDate.getTime() > maxTime) {
    return `Timestamp "${newTimestamp}" is in the future. Use a current or past timestamp.`
  }

  // Check newer than old timestamp (if there was one)
  if (oldTimestamp) {
    const oldDate = new Date(oldTimestamp)
    if (
      !isNaN(oldDate.getTime()) &&
      newDate.getTime() <= oldDate.getTime()
    ) {
      return `New timestamp "${newTimestamp}" must be later than previous timestamp "${oldTimestamp}".`
    }
  }

  return undefined
}

/**
 * Validates that a branch name is safe to use in git commands.
 * Branch names should only contain alphanumeric characters, hyphens,
 * underscores, forward slashes, and periods.
 */
export function validateBranchName(branch: string): boolean {
  // Git branch name rules (simplified for safety):
  // - Must not be empty
  // - Can contain alphanumeric, hyphen, underscore, forward slash, period
  // - Must not contain shell metacharacters or spaces
  const safeBranchPattern = /^[a-zA-Z0-9_.\-/]+$/
  return safeBranchPattern.test(branch) && branch.length > 0
}

/**
 * Formats a timestamp for display in error messages.
 * Returns ISO 8601 format without milliseconds.
 */
function formatTimestampForDisplay(date: Date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Extracts the skill name from a skill file path.
 *
 * Expected path pattern: .../skills/skills/<skill-name>/SKILL.md
 * The function explicitly looks for "skills/skills/<name>" pattern to avoid
 * ambiguity when there are multiple "skills" directories in the path.
 *
 * @param skillPath - Relative or absolute path to the SKILL.md file
 * @returns The skill name, or the full path if pattern doesn't match
 */
export function extractSkillName(skillPath: string): string {
  // Match the explicit pattern: skills/skills/<name>/SKILL.md
  // This handles both forward slashes and is explicit about the expected structure
  const match = skillPath.match(/skills\/skills\/([^/]+)\/SKILL\.md$/)
  if (match) {
    return match[1]
  }

  // Fallback: return the full path if pattern doesn't match
  return skillPath
}

/**
 * Parse the metadata block from a skill file.
 * Metadata is in an HTML comment at the top of the file:
 *
 * <!--
 * @flowglad/skill
 * sources_reviewed: 2025-01-21T12:00:00Z
 * source_files:
 *   - platform/docs/quickstart.mdx
 *   - platform/docs/sdks/setup.mdx
 * -->
 */
export function parseSkillMetadata(
  content: string,
  skillPath: string
): SkillMetadata | null {
  // Match the metadata comment block
  const metadataMatch = content.match(
    /<!--\s*\n@flowglad\/skill\s*\n([\s\S]*?)-->/
  )
  if (!metadataMatch) {
    return null
  }

  const metadataBlock = metadataMatch[1]

  // Parse sources_reviewed
  const sourcesReviewedMatch = metadataBlock.match(
    /sources_reviewed:\s*(.+?)(?:\n|$)/
  )
  const sourcesReviewed = sourcesReviewedMatch
    ? sourcesReviewedMatch[1].trim()
    : ''

  // Parse source_files (YAML list)
  // The regex matches one or more list items; empty lists return null and default to []
  const sourceFilesMatch = metadataBlock.match(
    /source_files:\s*\n((?:\s+-\s+.+(?:\n|$))+)/
  )
  const sourceFiles: string[] = []

  if (sourceFilesMatch) {
    const lines = sourceFilesMatch[1].split('\n')
    for (const line of lines) {
      const match = line.match(/^\s+-\s+(.+)$/)
      if (match) {
        sourceFiles.push(match[1].trim())
      }
    }
  }

  return {
    sourcesReviewed,
    sourceFiles,
    path: skillPath,
    name: extractSkillName(skillPath),
  }
}

/**
 * Discovers all skill files in the repository and categorizes them as valid or invalid.
 *
 * This function scans the skills/skills/ directory for SKILL.md files and attempts
 * to parse their metadata. Skills with valid metadata are returned in the `valid` array,
 * while skills with missing or malformed metadata are returned in the `invalid` array.
 *
 * @param repoRoot - Absolute path to the repository root
 * @returns Object containing arrays of valid skills and invalid skills
 */
export function discoverAllSkills(
  repoRoot: string
): SkillDiscoveryResult {
  const skillsDir = join(repoRoot, 'skills', 'skills')
  const result: SkillDiscoveryResult = {
    valid: [],
    invalid: [],
  }

  if (!existsSync(skillsDir)) {
    console.log(`Skills directory not found: ${skillsDir}`)
    return result
  }

  const entries = readdirSync(skillsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const absolutePath = join(skillsDir, entry.name, 'SKILL.md')
      if (existsSync(absolutePath)) {
        const relativePath = relative(repoRoot, absolutePath)
        const content = readFileSync(absolutePath, 'utf-8')
        const metadata = parseSkillMetadata(content, relativePath)

        if (metadata) {
          result.valid.push(metadata)
        } else {
          result.invalid.push({
            path: relativePath,
            absolutePath,
            reason: 'Missing required @flowglad/skill metadata block',
          })
        }
      }
    }
  }

  return result
}

/**
 * Get changed files in the PR by comparing to the base branch.
 * Throws an error if the git commands fail to prevent silent failures.
 */
function getChangedFiles(baseBranch: string): string[] {
  // Fetch the base branch to ensure we have the latest
  const fetchResult = spawnSync(
    'git',
    ['fetch', 'origin', baseBranch],
    {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  )

  if (fetchResult.status !== 0) {
    throw new Error(
      `Failed to fetch base branch '${baseBranch}': ${fetchResult.stderr || fetchResult.error?.message || 'Unknown error'}`
    )
  }

  // Get the list of changed files compared to the base branch
  const diffResult = spawnSync(
    'git',
    ['diff', '--name-only', `origin/${baseBranch}...HEAD`],
    {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  )

  if (diffResult.status !== 0) {
    throw new Error(
      `Failed to get changed files: ${diffResult.stderr || diffResult.error?.message || 'Unknown error'}`
    )
  }

  return (diffResult.stdout || '')
    .trim()
    .split('\n')
    .filter((f) => f.length > 0)
}

/**
 * Check if a file is a documentation file that we track
 */
export function isDocFile(filePath: string): boolean {
  return (
    filePath.startsWith('platform/docs/') &&
    (filePath.endsWith('.mdx') || filePath.endsWith('.md'))
  )
}

/**
 * Check if the sources_reviewed timestamp was changed in this PR
 * and validate that the new timestamp is valid.
 *
 * @param skillPath - Relative path to the skill file (e.g., "skills/skills/setup/SKILL.md")
 * @param baseBranch - The base branch to compare against (e.g., "main")
 * @param repoRoot - Absolute path to the repository root
 * @returns Result indicating if timestamp was updated and any validation errors
 */
function checkTimestampUpdate(
  skillPath: string,
  baseBranch: string,
  repoRoot: string
): TimestampCheckResult {
  try {
    // Get the current (HEAD) version using absolute path
    const absoluteSkillPath = join(repoRoot, skillPath)
    const currentContent = readFileSync(absoluteSkillPath, 'utf-8')
    const currentMetadata = parseSkillMetadata(
      currentContent,
      skillPath
    )

    // Get the base branch version using spawnSync for safety
    // Note: git show uses the relative path from repo root
    const showResult = spawnSync(
      'git',
      ['show', `origin/${baseBranch}:${skillPath}`],
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: repoRoot,
      }
    )

    if (showResult.status !== 0) {
      // File doesn't exist in base branch (new skill)
      // Validate the timestamp isn't in the future
      if (currentMetadata) {
        const validationError = validateTimestamp(
          currentMetadata.sourcesReviewed,
          null
        )
        return { updated: true, validationError }
      }
      return { updated: true }
    }

    const baseContent = showResult.stdout || ''
    const baseMetadata = parseSkillMetadata(baseContent, skillPath)

    // If either doesn't have metadata, consider it not updated
    if (!currentMetadata || !baseMetadata) {
      return {
        updated: currentMetadata !== null && baseMetadata === null,
      }
    }

    // Compare timestamps
    const updated =
      currentMetadata.sourcesReviewed !== baseMetadata.sourcesReviewed

    if (updated) {
      // Validate the new timestamp
      const validationError = validateTimestamp(
        currentMetadata.sourcesReviewed,
        baseMetadata.sourcesReviewed
      )
      return { updated, validationError }
    }

    return { updated: false }
  } catch (error) {
    console.error(`Error checking timestamp for ${skillPath}:`, error)
    return {
      updated: false,
      validationError: `Failed to check timestamp: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Prints a detailed error message for a skill missing metadata and exits.
 */
function reportMissingMetadataAndExit(
  invalidSkill: InvalidSkill
): never {
  console.error(`\nError: Skill file missing required metadata block`)
  console.error(`  File: ${invalidSkill.absolutePath}`)
  console.error(`  Reason: ${invalidSkill.reason}`)
  console.error(``)
  console.error(`  Required format at the top of the file:`)
  console.error(`  <!--`)
  console.error(`  @flowglad/skill`)
  console.error(`  sources_reviewed: YYYY-MM-DDTHH:MM:SSZ`)
  console.error(`  source_files:`)
  console.error(`    - platform/docs/path/to/source.mdx`)
  console.error(`  -->`)
  process.exit(1)
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const baseBranch = process.env.BASE_BRANCH || 'main'
  const repoRoot = process.cwd()

  // Validate branch name to prevent command injection
  if (!validateBranchName(baseBranch)) {
    console.error(`Error: Invalid branch name '${baseBranch}'`)
    console.error(
      'Branch names must only contain alphanumeric characters, hyphens, underscores, forward slashes, and periods.'
    )
    process.exit(1)
  }

  console.log(
    `Checking skills sync against base branch: ${baseBranch}`
  )
  console.log(`Repository root: ${repoRoot}`)
  console.log('')

  // Get changed files - throws on error to prevent silent failures
  const changedFiles = getChangedFiles(baseBranch)
  console.log(`Changed files: ${changedFiles.length}`)

  // Find changed docs
  const changedDocs = changedFiles.filter(isDocFile)
  if (changedDocs.length === 0) {
    console.log('No documentation changes detected. Check passed.')
    process.exit(0)
  }

  console.log(`Changed documentation files: ${changedDocs.length}`)
  for (const doc of changedDocs) {
    console.log(`  - ${doc}`)
  }
  console.log('')

  // Discover all skills and check for any with missing metadata
  const { valid: skills, invalid: invalidSkills } =
    discoverAllSkills(repoRoot)
  console.log(`Found ${skills.length} skills with metadata`)

  // Fail immediately if any skills are missing metadata
  if (invalidSkills.length > 0) {
    reportMissingMetadataAndExit(invalidSkills[0])
  }

  console.log('')

  // Check for sync issues
  const errors: SyncError[] = []

  for (const doc of changedDocs) {
    // Find skills that list this doc as a source
    const affectedSkills = skills.filter((s) =>
      s.sourceFiles.includes(doc)
    )

    for (const skill of affectedSkills) {
      const result = checkTimestampUpdate(
        skill.path,
        baseBranch,
        repoRoot
      )

      // Timestamp must always be updated when source docs change
      if (!result.updated) {
        errors.push({
          doc,
          skill: skill.name,
          skillPath: skill.path,
          message:
            `Documentation file "${doc}" changed, but skill "${skill.name}" timestamp was not updated.\n` +
            `\n` +
            `When source documentation changes, you must update the "sources_reviewed" timestamp\n` +
            `in ${skill.path} to confirm you have reviewed the docs and the skill is accurate.\n` +
            `\n` +
            `Update the skill content if needed, then set the timestamp to:\n` +
            `  sources_reviewed: ${formatTimestampForDisplay()}`,
        })
      } else if (result.validationError) {
        // Timestamp was updated but invalid
        errors.push({
          doc,
          skill: skill.name,
          skillPath: skill.path,
          message:
            `Skill "${skill.name}" has an invalid timestamp.\n` +
            `\n` +
            `${result.validationError}\n` +
            `\n` +
            `Set the timestamp to:\n` +
            `  sources_reviewed: ${formatTimestampForDisplay()}`,
        })
      }
    }
  }

  // Report results
  if (errors.length > 0) {
    console.error('\n========================================')
    console.error('SKILLS SYNC CHECK FAILED')
    console.error('========================================\n')

    for (const error of errors) {
      console.error(`[ERROR] ${error.skill}`)
      console.error(`-`.repeat(40))
      console.error(error.message)
      console.error('')
    }

    console.error(`Total issues: ${errors.length}`)
    process.exit(1)
  }

  console.log('\n========================================')
  console.log('SKILLS SYNC CHECK PASSED')
  console.log('========================================')
  console.log('')
  console.log(
    'All skills that reference changed documentation have been updated or confirmed.'
  )
  process.exit(0)
}

// Only run main when executed directly, not when imported for testing
if (import.meta.main) {
  main().catch((error) => {
    console.error('Unexpected error:', error)
    process.exit(1)
  })
}
