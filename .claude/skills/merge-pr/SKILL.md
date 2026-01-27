---
name: merge-pr
description: Merge a pull request after ensuring all checks pass, comments are resolved, and there are no merge conflicts. Use when ready to merge a PR on the current branch.
---

# Merge PR

Safely merge a pull request by ensuring all prerequisites are met: CI checks passing, all feedback addressed, and no merge conflicts.

## When to Use

- When you're ready to merge a PR on the current branch
- After completing all requested changes on a PR

## Prerequisites

- The current branch must have an open PR
- You should have completed your implementation work

## Process

### 1. Identify the PR

```bash
# Get current branch
git branch --show-current
```

Use GitHub MCP to find the PR:
```
mcp__github__list_pull_requests with state: "open" and head: "<branch-name>"
mcp__github__get_pull_request with owner, repo, and pull_number
```

Record the PR number, title, and base branch for later use.

### 2. Ensure All Checks Pass

**Invoke the `/resolve-checks` skill** to ensure all CI checks are passing.

This skill will:
- Run the full local test suite
- Fix any failing tests
- Verify CI is green

Do not proceed until `/resolve-checks` completes successfully with all checks passing.

### 3. Review and Address All Feedback

Get all PR comments and reviews:

```
mcp__github__get_pull_request_comments with owner, repo, and pull_number
mcp__github__get_pull_request_reviews with owner, repo, and pull_number
```

**Every piece of feedback must be addressed.** For each comment:

#### Option A: Incorporate
Make the requested change:
1. Implement the feedback
2. Commit with a clear message referencing the feedback
3. Push the changes
4. Reply to the comment confirming the change was made

#### Option B: Resolve
If already addressed or no longer applicable:
1. Reply explaining how/why it's resolved
2. Mark as resolved if GitHub UI was used to create the comment

#### Option C: WONTFIX
If you disagree or it's out of scope:
1. Reply with a clear explanation of why
2. Include "WONTFIX" in the reply so it's clear this is intentional
3. Be respectful but direct about the reasoning

**Do not proceed until every comment falls into one of these categories.**

### 4. Check for Merge Conflicts

```
mcp__github__get_pull_request with owner, repo, and pull_number
```

Check the `mergeable` and `mergeable_state` fields.

**If there are conflicts:**

```bash
# Fetch latest base branch
git fetch origin main

# Merge base into your branch
git merge origin/main
```

Resolve any conflicts:
1. Open each conflicting file
2. Resolve the conflicts (keep correct code from both sides)
3. Run tests to verify the resolution is correct
4. Commit the merge resolution
5. Push the changes

After resolving conflicts, re-run `/resolve-checks` to ensure nothing broke.

### 5. Update Branch if Behind

If the PR branch is behind the base branch but has no conflicts:

```
mcp__github__update_pull_request_branch with owner, repo, and pull_number
```

Wait for CI to complete on the updated branch before proceeding.

### 6. Final Verification

Before merging, verify the checklist:

- [ ] `/resolve-checks` completed successfully
- [ ] All CI checks are green
- [ ] All review comments addressed (incorporated/resolved/WONTFIX)
- [ ] No merge conflicts
- [ ] Branch is up to date with base

### 7. Merge the PR

```
mcp__github__merge_pull_request with:
  - owner
  - repo
  - pull_number
  - merge_method: "squash" (preferred for clean history)
```

## Error Handling

### resolve-checks fails
Do not proceed. The skill will report what's failing. Fix those issues first.

### Unaddressed feedback found
List all unaddressed comments and handle each one before retrying.

### Merge conflicts after update
Re-run conflict resolution (step 4) and then `/resolve-checks` again.

### Merge blocked by branch protection
Check what's blocking:
- Required reviews not met → Request review or address reviewer concerns
- Required status checks failing → Run `/resolve-checks`
- Branch not up to date → Run step 5

### Merge fails
Read the error message. Common causes:
- PR was closed or already merged
- Base branch was force-pushed
- New commits were pushed during merge

## Output

**On successful merge:**
```
Merged PR #<number>: <title>
Merge commit: <sha>
Base branch: <base>

Summary:
- Checks resolved: <count> issues fixed
- Comments addressed: <count> incorporated, <count> resolved, <count> WONTFIX
```

**On failure:**
```
Merge blocked: <reason>

Status:
- Checks: <passing|failing>
- Comments: <count> unaddressed
- Conflicts: <yes|no>

Next steps:
- <what needs to be done>
```
