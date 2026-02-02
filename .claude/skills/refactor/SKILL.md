---
name: refactor
description: Perform large-scale refactors and renames in TypeScript codebases. Use when renaming symbols across files, doing pattern replacements, changing function signatures, or performing codebase-wide refactors. Prefer AST-aware tools over text-based replacements.
---

# Large-Scale Refactoring

Perform codebase-wide refactors using AST-aware tools for accuracy and safety. This skill emphasizes scripted approaches over individual file edits and integrates with the gameplan workflow for complex changes.

## When to Use

- Renaming symbols (functions, types, variables) across multiple files
- Pattern replacements (e.g., updating API calls, changing import paths)
- Function signature changes that affect many call sites
- Migrating from one API/pattern to another
- Removing deprecated code paths
- Consistent style/naming transformations

## Complexity Assessment

Before starting, assess the refactor complexity:

| Complexity | Files Affected | Patterns | Approach |
|------------|----------------|----------|----------|
| **Simple** | < 20 files | Single pattern | Direct ast-grep execution |
| **Medium** | 20-100 files | Multiple patterns | Scripted approach with verification |
| **Complex** | 100+ files, behavioral changes | Multiple patterns, tests affected | Create a gameplan first |

**Complex refactors** involving architectural changes, multi-step migrations, or behavioral modifications should use the gameplan workflow. See `platform/flowglad-next/llm-prompts/new-gameplan.md` for the template.

## Core Principles

1. **Understand scope BEFORE making changes** - Search and count affected files before executing replacements
2. **Work at AST level** - Default to ast-grep for syntax-aware matching (per CLAUDE.md guidance)
3. **Verify after changes** - Always run `bun run check` after refactoring
4. **Prefer idempotent transformations** - Running the same refactor twice should produce the same result
5. **For complex refactors** - Use multi-patch strategy with `[INFRA]` patches shipping first

## Tool Selection

Prefer tools higher in this hierarchy:

| Priority | Tool | Best For | Reference |
|----------|------|----------|-----------|
| 1 | **ast-grep** | Most TypeScript refactoring (search + replace) | [ast-grep-patterns.md](ast-grep-patterns.md) |
| 2 | **ts-morph** | Type-aware transforms requiring TypeScript compiler API | [tools-reference.md](tools-reference.md) |
| 3 | **jscodeshift** | Leveraging existing codemods | [tools-reference.md](tools-reference.md) |
| 4 | **comby** | Simple structural patterns | [tools-reference.md](tools-reference.md) |
| 5 | **ESLint --fix** | Enforcing patterns via rules | [tools-reference.md](tools-reference.md) |
| 6 | **sed/awk** | Simple text-only replacements | [tools-reference.md](tools-reference.md) |
| 7 | **Individual edits** | Fallback when scripted approaches fail | - |

See [tools-reference.md](tools-reference.md) for detailed usage of each tool.

## Simple Refactor Workflow

For refactors affecting < 100 files with a single pattern:

### Step 1: Understand the Scope

```bash
# Count affected files
ast-grep --lang typescript -p 'oldFunctionName($$$ARGS)' --json | jq length

# Preview matches with context
ast-grep --lang typescript -p 'oldFunctionName($$$ARGS)' -r 'newFunctionName($$$ARGS)' --interactive
```

### Step 2: Create a Checkpoint

```bash
# Ensure clean working directory
git status

# Create a checkpoint commit or stash if needed
git stash push -m "pre-refactor checkpoint"
```

### Step 3: Execute the Refactor

```bash
# Apply the transformation
ast-grep --lang typescript -p 'oldFunctionName($$$ARGS)' -r 'newFunctionName($$$ARGS)' --update-all
```

### Step 4: Verify Changes

```bash
# Check for type errors and lint issues
bun run check

# Review the diff
git diff --stat
git diff
```

### Step 5: Handle Edge Cases

Some matches may require manual attention:
- Dynamic references (e.g., `obj[funcName]`)
- String literals containing the pattern
- Comments and documentation

### Step 6: Run Tests

```bash
# Run affected tests
bun run test:backend
```

### Step 7: Commit

```bash
git add -A
git commit -m "refactor: rename oldFunctionName to newFunctionName

Co-Authored-By: Claude <noreply@anthropic.com>"
```

## Complex Refactor Workflow

For refactors involving 100+ files, behavioral changes, or architectural modifications:

### Step 1: Create a Gameplan

Use the gameplan template at `platform/flowglad-next/llm-prompts/new-gameplan.md`. The gameplan should include:

- **Problem Statement**: What we're changing and why
- **Current State Analysis**: How the code currently works
- **Required Changes**: Specific files, functions, and transformations
- **Acceptance Criteria**: What "done" looks like
- **Patches**: Ordered list of incremental changes

### Step 2: Follow Multi-Patch Strategy

Organize patches by classification:

| Classification | Description | When to Ship |
|----------------|-------------|--------------|
| `[INFRA]` | No observable behavior change (types, helpers, test stubs) | Ship early |
| `[GATED]` | New behavior behind feature flag | Ship before activation |
| `[BEHAVIOR]` | Changes observable behavior | Ship last, keep small |

**Goal**: Maximize `[INFRA]` and `[GATED]` patches. Ship non-functional changes first to enable early review and reduce risk.

### Step 3: Test-First Pattern

Write test stubs with `.skip` markers BEFORE implementation:

```typescript
describe('newApiCall', () => {
  it.skip('should return the expected shape', async () => {
    // PENDING: Patch 3
    // setup: create test data
    // expectation: returns { id, name, status }
  })
})
```

Implement and unskip tests in the same patch as the code being tested.

### Step 4: Execute Patches in Order

For each patch:
1. Read the patch specification from the gameplan
2. Execute the changes (prefer ast-grep/ts-morph over manual edits)
3. Run `bun run check`
4. Run tests (`bun run test:backend`)
5. Commit with patch reference

## Common Refactoring Patterns

### Rename a Function

```bash
# Find all usages
ast-grep --lang typescript -p 'oldName($$$ARGS)'

# Replace
ast-grep --lang typescript -p 'oldName($$$ARGS)' -r 'newName($$$ARGS)' --update-all
```

### Rename a Type

```bash
# Find type usages
ast-grep --lang typescript -p ': OldType'
ast-grep --lang typescript -p 'OldType<$T>'

# Replace (run both)
ast-grep --lang typescript -p ': OldType' -r ': NewType' --update-all
ast-grep --lang typescript -p 'OldType<$T>' -r 'NewType<$T>' --update-all
```

### Change Function Signature (Add Parameter)

```bash
# Find calls to update
ast-grep --lang typescript -p 'myFunc($ARG1, $ARG2)'

# Add new parameter with default
ast-grep --lang typescript -p 'myFunc($ARG1, $ARG2)' -r 'myFunc($ARG1, $ARG2, { newOption: false })' --update-all
```

### Update Import Paths

```bash
# Find imports from old path
ast-grep --lang typescript -p "import { $$$IMPORTS } from '@/old/path'"

# Update to new path
ast-grep --lang typescript -p "import { \$\$\$IMPORTS } from '@/old/path'" -r "import { \$\$\$IMPORTS } from '@/new/path'" --update-all
```

### Remove Deprecated Function Calls

```bash
# Find and remove deprecated calls
ast-grep --lang typescript -p 'deprecatedInit()' -r '' --update-all
```

See [ast-grep-patterns.md](ast-grep-patterns.md) for more patterns.

## Verification Checklist

After any refactor:

- [ ] `bun run check` passes (types and lint)
- [ ] `git diff --stat` shows expected file count
- [ ] No unintended changes (review diff carefully)
- [ ] Tests pass (`bun run test:backend`)
- [ ] Edge cases handled (string literals, dynamic references, comments)

## Reference Documentation

- [ast-grep-patterns.md](ast-grep-patterns.md) - Pattern library and metavariable syntax
- [tools-reference.md](tools-reference.md) - Detailed tool comparison and usage
- `platform/flowglad-next/llm-prompts/new-gameplan.md` - Gameplan template for complex refactors

## Example: Full Refactor Session

Rename `createBillingRun` to `initiateBillingRun` across the codebase:

```bash
# 1. Scope the change
ast-grep --lang typescript -p 'createBillingRun' --json | jq length
# Output: 47

# 2. Preview the transformation
ast-grep --lang typescript -p 'createBillingRun($$$ARGS)' -r 'initiateBillingRun($$$ARGS)'

# 3. Apply the change
ast-grep --lang typescript -p 'createBillingRun($$$ARGS)' -r 'initiateBillingRun($$$ARGS)' --update-all

# 4. Handle the function definition separately
ast-grep --lang typescript -p 'const createBillingRun = $BODY' -r 'const initiateBillingRun = $BODY' --update-all

# 5. Update type annotations if any
ast-grep --lang typescript -p 'typeof createBillingRun' -r 'typeof initiateBillingRun' --update-all

# 6. Verify
bun run check

# 7. Review
git diff --stat
git diff

# 8. Test
bun run test:backend

# 9. Commit
git add -A
git commit -m "refactor: rename createBillingRun to initiateBillingRun

Renamed for clarity - 'initiate' better describes the action of
starting a billing run process.

Co-Authored-By: Claude <noreply@anthropic.com>"
```
