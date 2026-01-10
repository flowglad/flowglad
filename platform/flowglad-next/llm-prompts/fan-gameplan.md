# Fan Gameplan

I'm providing a gameplan with patches and a dependency graph (includes a **Project Name** in kebab-case).

## Your Task

1. Extract the **Project Name** from the gameplan (e.g., `subscription-adjustments`)

2. **Auto-detect completed patches** by searching for merged PRs:
   - Run: `gh pr list --state merged --search "[{project-name}]" --json number,title`
   - Parse the results to find PRs matching the pattern `[{project-name}] Patch {N}: ...`
   - Extract patch numbers from matched titles to build the completed list
   - Example: If you find merged PRs titled `[subscription-adjustments] Patch 1: Add schema` and `[subscription-adjustments] Patch 2: Add API`, then `Completed: [1, 2]`

3. **Detect open PRs** by searching:
   - Run: `gh pr list --state open --search "[{project-name}]" --json number,title,headRefName`
   - Build a map of patch number → open PR info (number, headRefName)

4. Parse the dependency graph and identify all **unblocked** patches:
   - A patch is unblocked if all its dependencies are either merged OR have an open PR
   - Exclude patches that already have open PRs (detected in step 3)
   - Exclude patches that are already merged (detected in step 2)

5. **Determine base branch per patch**: For each unblocked patch, find the open PRs in its dependency chain:
   - **0 open PRs in chain**: Base branch is `main`
   - **1 open PR in chain**: Base branch is that PR's `headRefName`
   - **2+ open PRs in chain**: This patch is blocked — skip it (report why)

6. For each unblocked patch that passed step 5, create `llm-prompts/patches/{project-name}/patch-{N}.md` using this template:

```markdown
# [{project-name}] Patch {N}: {Title}

## Problem Statement
{verbatim from gameplan}

## Solution Summary
{verbatim from gameplan}

## Design Decisions (Non-negotiable)
{verbatim "Explicit Opinions" section from gameplan}

## Dependencies Completed
{For each dependency, one line summarizing what it added, e.g.: "Patch 2 added `adjustSubscription` function in src/subscriptions/adjust.ts"}
{If no dependencies, write: "None - this patch has no dependencies."}

## Your Task
{Patch instructions verbatim from gameplan, including files to modify/create and specific changes}

## Tests to Implement
{Test stubs for this patch only, verbatim from gameplan}

## Git Instructions
- Branch from: `{base branch determined in step 5 for this patch}`
- Branch name: `{project-name}/patch-{N}-{descriptive-slug}`
- PR base: `{base branch determined in step 5 for this patch}`
- After completing, run `bun run check` to verify lint/typecheck passes.

## PR Title (CRITICAL)
**You MUST use this EXACT title format when creating the PR:**

`[{project-name}] Patch {N}: {Title}`

For example: `[redis-cache-helpers] Patch 1: Cache Infrastructure`

Do NOT use conventional commit format (e.g., `feat:`, `fix:`). The bracketed project name and patch number are required for tracking.
```

7. Output a summary: "Created prompts for patches: [X, Y, Z]"

---

## Dependency Graph Format

The gameplan's dependency graph should follow this format:
```text
- Patch 1 -> []
- Patch 2 -> [1]
- Patch 3 -> [1]
- Patch 4 -> [2, 3]
```

Where `[]` means no dependencies, and `[1, 2]` means depends on patches 1 and 2.

---

## Example

Given gameplan with:
- Project Name: `stripe-tests`
- Dependency graph:
  - Patch 1 -> []
  - Patch 2 -> [1]
  - Patch 3 -> [1, 2]
  - Patch 4 -> [1, 3]
  - Patch 5 -> [1]
  - Patch 6 -> [5]
  - Patch 7 -> [1]
  - Patch 8 -> [5, 7]

**Step 2 (detect completed)**:
```bash
gh pr list --state merged --search "[stripe-tests]" --json number,title
```
Result: `[{"number": 100, "title": "[stripe-tests] Patch 1: Setup"}, {"number": 101, "title": "[stripe-tests] Patch 2: Core"}]`
→ Merged: [1, 2]

**Step 3 (detect open PRs)**:
```bash
gh pr list --state open --search "[stripe-tests]" --json number,title,headRefName
```
Result:
```json
[
  {"number": 102, "title": "[stripe-tests] Patch 5: Tax tests", "headRefName": "stripe-tests/patch-5-tax"},
  {"number": 103, "title": "[stripe-tests] Patch 7: Utils", "headRefName": "stripe-tests/patch-7-utils"}
]
```
→ Open PRs: {5: "stripe-tests/patch-5-tax", 7: "stripe-tests/patch-7-utils"}

**Step 4 (find unblocked)**:
- Patch 1: merged (skip)
- Patch 2: merged (skip)
- Patch 3: depends on [1, 2], both merged ✓, no open PR → **candidate**
- Patch 4: depends on [1, 3], patch 3 not merged/open → blocked
- Patch 5: has open PR (skip)
- Patch 6: depends on [5], patch 5 has open PR ✓ → **candidate**
- Patch 7: has open PR (skip)
- Patch 8: depends on [5, 7], both have open PRs → **candidate**

Candidates: [3, 6, 8]

**Step 5 (determine base branch per patch)**:
- Patch 3: deps [1, 2] — 0 open PRs in chain → base: `main`
- Patch 6: deps [5] — 1 open PR (#102) in chain → base: `stripe-tests/patch-5-tax`
- Patch 8: deps [5, 7] — 2 open PRs (#102, #103) in chain → **blocked** (skip)

Proceeding with: [3, 6]

Create:
- `llm-prompts/patches/stripe-tests/patch-3.md` (base: `main`)
- `llm-prompts/patches/stripe-tests/patch-6.md` (base: `stripe-tests/patch-5-tax`)

---

## Gameplan Input

{paste gameplan here}
