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

interface SyncError {
  doc: string
  skill: string
  skillPath: string
  message: string
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
  const sourceFilesMatch = metadataBlock.match(
    /source_files:\s*\n((?:\s+-\s+.+\n?)+)/
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

  // Extract skill name from path
  const pathParts = skillPath.split('/')
  const skillsIndex = pathParts.indexOf('skills')
  const name =
    skillsIndex >= 0 && pathParts.length > skillsIndex + 2
      ? pathParts[skillsIndex + 2]
      : skillPath

  return {
    sourcesReviewed,
    sourceFiles,
    path: skillPath,
    name,
  }
}

/**
 * Get all skill files and their metadata
 */
function getAllSkills(repoRoot: string): SkillMetadata[] {
  const skillsDir = join(repoRoot, 'skills', 'skills')
  const skills: SkillMetadata[] = []

  if (!existsSync(skillsDir)) {
    console.log(`Skills directory not found: ${skillsDir}`)
    return skills
  }

  const entries = readdirSync(skillsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillPath = join(skillsDir, entry.name, 'SKILL.md')
      if (existsSync(skillPath)) {
        const content = readFileSync(skillPath, 'utf-8')
        const metadata = parseSkillMetadata(
          content,
          relative(repoRoot, skillPath)
        )
        if (metadata) {
          skills.push(metadata)
        } else {
          console.warn(
            `Warning: Skill file missing metadata block: ${skillPath}`
          )
        }
      }
    }
  }

  return skills
}

/**
 * Get changed files in the PR by comparing to the base branch.
 * Throws an error if the git commands fail to prevent silent failures.
 */
function getChangedFiles(baseBranch: string): string[] {
  // Fetch the base branch to ensure we have the latest
  const fetchResult = spawnSync('git', ['fetch', 'origin', baseBranch], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })

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
    (filePath.startsWith('platform/docs/') ||
      filePath.startsWith('platform/docs/snippets/')) &&
    (filePath.endsWith('.mdx') || filePath.endsWith('.md'))
  )
}

/**
 * Check if the sources_reviewed timestamp was changed in this PR
 */
function wasTimestampUpdated(
  skillPath: string,
  baseBranch: string
): boolean {
  try {
    // Get the current (HEAD) version
    const currentContent = readFileSync(skillPath, 'utf-8')
    const currentMetadata = parseSkillMetadata(currentContent, skillPath)

    // Get the base branch version using spawnSync for safety
    const showResult = spawnSync(
      'git',
      ['show', `origin/${baseBranch}:${skillPath}`],
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    )

    if (showResult.status !== 0) {
      // File doesn't exist in base branch (new skill)
      return true
    }

    const baseContent = showResult.stdout || ''
    const baseMetadata = parseSkillMetadata(baseContent, skillPath)

    // If either doesn't have metadata, consider it not updated
    if (!currentMetadata || !baseMetadata) {
      return currentMetadata !== null && baseMetadata === null
    }

    // Compare timestamps
    return currentMetadata.sourcesReviewed !== baseMetadata.sourcesReviewed
  } catch (error) {
    console.error(`Error checking timestamp for ${skillPath}:`, error)
    return false
  }
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

  console.log(`Checking skills sync against base branch: ${baseBranch}`)
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

  // Get all skills and their metadata
  const skills = getAllSkills(repoRoot)
  console.log(`Found ${skills.length} skills with metadata`)

  // Check for skills without metadata (error case)
  const skillsDir = join(repoRoot, 'skills', 'skills')
  if (existsSync(skillsDir)) {
    const entries = readdirSync(skillsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = join(skillsDir, entry.name, 'SKILL.md')
        if (existsSync(skillPath)) {
          const content = readFileSync(skillPath, 'utf-8')
          const metadata = parseSkillMetadata(
            content,
            relative(repoRoot, skillPath)
          )
          if (!metadata) {
            console.error(
              `\nError: Skill file missing required metadata block`
            )
            console.error(`  File: ${skillPath}`)
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
        }
      }
    }
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
      const skillChanged = changedFiles.includes(skill.path)
      const timestampUpdated = wasTimestampUpdated(
        skill.path,
        baseBranch
      )

      if (!skillChanged && !timestampUpdated) {
        errors.push({
          doc,
          skill: skill.name,
          skillPath: skill.path,
          message:
            `Documentation file "${doc}" changed, but skill "${skill.name}" was not updated.\n` +
            `\n` +
            `Either:\n` +
            `  1. Update the skill content to reflect the documentation changes, OR\n` +
            `  2. Update the "sources_reviewed" timestamp in ${skill.path} to confirm the skill is still accurate\n` +
            `\n` +
            `The sources_reviewed timestamp should be in ISO 8601 format with UTC timezone:\n` +
            `  sources_reviewed: ${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}`,
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
