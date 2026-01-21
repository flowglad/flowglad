import { describe, expect, it } from 'bun:test'
import {
  isDocFile,
  parseSkillMetadata,
  SkillMetadata,
  validateBranchName,
  validateTimestamp,
} from './check-skills-sync'

describe('validateBranchName', () => {
  it('accepts valid branch names with alphanumeric characters, hyphens, underscores, slashes, and periods', () => {
    expect(validateBranchName('main')).toBe(true)
    expect(validateBranchName('feature/add-new-skill')).toBe(true)
    expect(validateBranchName('release-1.0.0')).toBe(true)
    expect(validateBranchName('user_branch')).toBe(true)
    expect(validateBranchName('v1.2.3')).toBe(true)
    expect(validateBranchName('feature/JIRA-123_description')).toBe(true)
    expect(validateBranchName('refs/heads/main')).toBe(true)
  })

  it('rejects empty branch names', () => {
    expect(validateBranchName('')).toBe(false)
  })

  it('rejects branch names with shell metacharacters that could enable command injection', () => {
    expect(validateBranchName('main; rm -rf /')).toBe(false)
    expect(validateBranchName('main && echo pwned')).toBe(false)
    expect(validateBranchName('main | cat /etc/passwd')).toBe(false)
    expect(validateBranchName('$(whoami)')).toBe(false)
    expect(validateBranchName('`whoami`')).toBe(false)
    expect(validateBranchName("main'")).toBe(false)
    expect(validateBranchName('main"')).toBe(false)
    expect(validateBranchName('main with spaces')).toBe(false)
    expect(validateBranchName('main\necho pwned')).toBe(false)
  })
})

describe('isDocFile', () => {
  it('returns true for .mdx files in platform/docs/', () => {
    expect(isDocFile('platform/docs/quickstart.mdx')).toBe(true)
    expect(isDocFile('platform/docs/features/checkout-sessions.mdx')).toBe(true)
    expect(isDocFile('platform/docs/sdks/setup.mdx')).toBe(true)
  })

  it('returns true for .md files in platform/docs/', () => {
    expect(isDocFile('platform/docs/README.md')).toBe(true)
    expect(isDocFile('platform/docs/features/overview.md')).toBe(true)
  })

  it('returns true for files in platform/docs/snippets/', () => {
    expect(isDocFile('platform/docs/snippets/setup-nextjs.mdx')).toBe(true)
    expect(isDocFile('platform/docs/snippets/intro.md')).toBe(true)
  })

  it('returns false for non-documentation files', () => {
    expect(isDocFile('src/components/Button.tsx')).toBe(false)
    expect(isDocFile('package.json')).toBe(false)
    expect(isDocFile('README.md')).toBe(false)
    expect(isDocFile('skills/skills/setup/SKILL.md')).toBe(false)
  })

  it('returns false for documentation paths with wrong extensions', () => {
    expect(isDocFile('platform/docs/image.png')).toBe(false)
    expect(isDocFile('platform/docs/config.json')).toBe(false)
    expect(isDocFile('platform/docs/script.ts')).toBe(false)
  })
})

describe('parseSkillMetadata', () => {
  it('parses a valid metadata block with all fields', () => {
    const content = `<!--
@flowglad/skill
sources_reviewed: 2026-01-21T12:00:00Z
source_files:
  - platform/docs/quickstart.mdx
  - platform/docs/sdks/setup.mdx
-->

# Skill Title

Some content here.`

    const result = parseSkillMetadata(content, 'skills/skills/setup/SKILL.md')

    expect(result).not.toBeNull()
    const metadata = result as SkillMetadata
    expect(metadata.sourcesReviewed).toBe('2026-01-21T12:00:00Z')
    expect(metadata.sourceFiles).toEqual([
      'platform/docs/quickstart.mdx',
      'platform/docs/sdks/setup.mdx',
    ])
    expect(metadata.path).toBe('skills/skills/setup/SKILL.md')
    expect(metadata.name).toBe('setup')
  })

  it('parses metadata with a single source file', () => {
    const content = `<!--
@flowglad/skill
sources_reviewed: 2026-01-15T08:30:00Z
source_files:
  - platform/docs/features/checkout-sessions.mdx
-->

# Checkout`

    const result = parseSkillMetadata(content, 'skills/skills/checkout/SKILL.md')

    expect(result).not.toBeNull()
    const metadata = result as SkillMetadata
    expect(metadata.sourcesReviewed).toBe('2026-01-15T08:30:00Z')
    expect(metadata.sourceFiles).toEqual([
      'platform/docs/features/checkout-sessions.mdx',
    ])
    expect(metadata.name).toBe('checkout')
  })

  it('parses metadata with empty source_files list', () => {
    const content = `<!--
@flowglad/skill
sources_reviewed: 2026-01-21T12:00:00Z
source_files:
-->

# Standalone Skill`

    const result = parseSkillMetadata(
      content,
      'skills/skills/standalone/SKILL.md'
    )

    expect(result).not.toBeNull()
    const metadata = result as SkillMetadata
    expect(metadata.sourcesReviewed).toBe('2026-01-21T12:00:00Z')
    expect(metadata.sourceFiles).toEqual([])
  })

  it('returns null when metadata block is missing', () => {
    const content = `# Skill Without Metadata

This skill has no metadata block.`

    const result = parseSkillMetadata(content, 'skills/skills/test/SKILL.md')

    expect(result).toBeNull()
  })

  it('returns null when @flowglad/skill marker is missing', () => {
    const content = `<!--
sources_reviewed: 2026-01-21T12:00:00Z
source_files:
  - platform/docs/quickstart.mdx
-->

# Missing Marker`

    const result = parseSkillMetadata(content, 'skills/skills/test/SKILL.md')

    expect(result).toBeNull()
  })

  it('extracts skill name from path with nested skills directory structure', () => {
    const content = `<!--
@flowglad/skill
sources_reviewed: 2026-01-21T12:00:00Z
source_files:
  - platform/docs/test.mdx
-->

# Test`

    const result = parseSkillMetadata(
      content,
      'some/path/skills/skills/my-skill/SKILL.md'
    )

    expect(result).not.toBeNull()
    expect((result as SkillMetadata).name).toBe('my-skill')
  })

  it('uses full path as name when skills directory structure is not found', () => {
    const content = `<!--
@flowglad/skill
sources_reviewed: 2026-01-21T12:00:00Z
source_files:
  - platform/docs/test.mdx
-->

# Test`

    const result = parseSkillMetadata(content, 'other/path/SKILL.md')

    expect(result).not.toBeNull()
    expect((result as SkillMetadata).name).toBe('other/path/SKILL.md')
  })

  it('handles metadata with extra whitespace', () => {
    const content = `<!--
@flowglad/skill
sources_reviewed:   2026-01-21T12:00:00Z
source_files:
  -   platform/docs/quickstart.mdx
  -  platform/docs/setup.mdx
-->

# Test`

    const result = parseSkillMetadata(content, 'skills/skills/test/SKILL.md')

    expect(result).not.toBeNull()
    const metadata = result as SkillMetadata
    expect(metadata.sourcesReviewed).toBe('2026-01-21T12:00:00Z')
    expect(metadata.sourceFiles).toEqual([
      'platform/docs/quickstart.mdx',
      'platform/docs/setup.mdx',
    ])
  })
})

describe('validateTimestamp', () => {
  it('returns undefined for valid timestamps in the past with no previous timestamp', () => {
    const pastTimestamp = '2025-01-15T12:00:00Z'
    expect(validateTimestamp(pastTimestamp, null)).toBeUndefined()
  })

  it('returns undefined for valid timestamps that are later than the previous timestamp', () => {
    const oldTimestamp = '2025-01-15T12:00:00Z'
    const newTimestamp = '2025-01-20T12:00:00Z'
    expect(validateTimestamp(newTimestamp, oldTimestamp)).toBeUndefined()
  })

  it('returns error for timestamps with invalid format', () => {
    const invalidTimestamp = 'not-a-date'
    const result = validateTimestamp(invalidTimestamp, null)
    expect(result).toContain('Invalid timestamp format')
    expect(result).toContain(invalidTimestamp)
  })

  it('returns error for timestamps in the future (beyond 10 second grace period)', () => {
    const futureDate = new Date(Date.now() + 60000) // 1 minute in future
    const futureTimestamp = futureDate.toISOString().replace(/\.\d{3}Z$/, 'Z')
    const result = validateTimestamp(futureTimestamp, null)
    expect(result).toContain('in the future')
  })

  it('returns error when new timestamp is not later than the previous timestamp', () => {
    const oldTimestamp = '2025-01-20T12:00:00Z'
    const newTimestamp = '2025-01-15T12:00:00Z' // Earlier than old
    const result = validateTimestamp(newTimestamp, oldTimestamp)
    expect(result).toContain('must be later than previous timestamp')
    expect(result).toContain(oldTimestamp)
  })

  it('returns error when new timestamp equals the previous timestamp', () => {
    const timestamp = '2025-01-20T12:00:00Z'
    const result = validateTimestamp(timestamp, timestamp)
    expect(result).toContain('must be later than previous timestamp')
  })

  it('allows timestamps within 10 second grace period of current time', () => {
    // Create a timestamp that is 5 seconds in the future (within grace period)
    const nearFuture = new Date(Date.now() + 5000)
    const nearFutureTimestamp = nearFuture.toISOString().replace(/\.\d{3}Z$/, 'Z')
    expect(validateTimestamp(nearFutureTimestamp, null)).toBeUndefined()
  })

  it('handles timestamps with milliseconds in ISO format', () => {
    const timestampWithMs = '2025-01-15T12:00:00.123Z'
    expect(validateTimestamp(timestampWithMs, null)).toBeUndefined()
  })

  it('ignores invalid old timestamp when checking order', () => {
    // If old timestamp is invalid, we only validate the new one
    const validNew = '2025-01-20T12:00:00Z'
    const invalidOld = 'not-a-date'
    // Should not error because invalid old timestamp is ignored
    expect(validateTimestamp(validNew, invalidOld)).toBeUndefined()
  })
})
