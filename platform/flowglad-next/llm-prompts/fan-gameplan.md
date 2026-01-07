# Fan Gameplan

I'm providing a gameplan with patches and a dependency graph (includes a **Project Name** in kebab-case).

## Your Task

1. Extract the **Project Name** from the gameplan (e.g., `subscription-adjustments`)

2. **Auto-detect completed patches** by searching for merged PRs:
   - Run: `gh pr list --state merged --search "[{project-name}]" --json number,title`
   - Parse the results to find PRs matching the pattern `[{project-name}] Patch {N}: ...`
   - Extract patch numbers from matched titles to build the completed list
   - Example: If you find merged PRs titled `[subscription-adjustments] Patch 1: Add schema` and `[subscription-adjustments] Patch 2: Add API`, then `Completed: [1, 2]`

3. **Auto-detect base branch** by searching for open PRs:
   - Run: `gh pr list --state open --search "[{project-name}]" --json number,title,headRefName`
   - **0 open PRs**: Use `main` as base branch
   - **1 open PR**: Use that PR's `headRefName` as base branch (and note its number for PR base)
   - **2+ open PRs**: Stop and report "Waiting for open PRs to merge: [list PR numbers/titles]" — cannot proceed until only 0 or 1 remain open

4. Parse the dependency graph and identify all **unblocked** patches:
   - A patch is unblocked if all its dependencies are in the completed list
   - Exclude patches that already have open PRs (detected in step 3)
   - Exclude patches that are already merged (detected in step 2)

5. For each unblocked patch, create `llm-prompts/patches/{project-name}/patch-{N}.md` using this template:

```template
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
- Branch from: `{auto-detected base branch from step 3}`
- Branch name: `{project-name}/patch-{N}-{descriptive-slug}`
- PR base: `{auto-detected base branch from step 3}`
- After completing, run `bun run check` to verify lint/typecheck passes.
- Create a PR with title: "[{project-name}] Patch {N}: {Title}"
```

6. Output a summary: "Created prompts for patches: [X, Y, Z]"

---

## Dependency Graph Format

The gameplan's dependency graph should follow this format:
```
- Patch 1 -> []
- Patch 2 -> [1]
- Patch 3 -> [1]
- Patch 4 -> [2, 3]
```

Where `[]` means no dependencies, and `[1, 2]` means depends on patches 1 and 2.

---

## Example

Given gameplan with:
- Project Name: `subscription-adjustments`
- Dependency graph: Patch 1 -> [], Patch 2 -> [1], Patch 3 -> [1], Patch 4 -> [2, 3]

**Step 2 (detect completed)**:
```
gh pr list --state merged --search "[subscription-adjustments]" --json number,title
```
Result: `[{"number": 1234, "title": "[subscription-adjustments] Patch 1: Add schema"}]`
→ Completed: [1]

**Step 3 (detect base branch)**:
```
gh pr list --state open --search "[subscription-adjustments]" --json number,title,headRefName
```
Result: `[{"number": 1236, "title": "[subscription-adjustments] Patch 2: Add validation", "headRefName": "subscription-adjustments/patch-2-validation"}]`
→ 1 open PR, base branch: `subscription-adjustments/patch-2-validation`

**Step 4 (find unblocked)**:
- Patch 1: merged (skip)
- Patch 2: has open PR (skip)
- Patch 3: depends on [1], patch 1 is merged ✓, no open PR → **unblocked**
- Patch 4: depends on [2, 3], patch 2 not merged → blocked

Unblocked patches: [3]

Create:
- `llm-prompts/patches/subscription-adjustments/patch-3.md`

It should:
- Branch from `subscription-adjustments/patch-2-validation`
- Use branch name like `subscription-adjustments/patch-3-add-api`
- Create PR with base `subscription-adjustments/patch-2-validation`
- PR titled `[subscription-adjustments] Patch 3: Add API`

---

## Gameplan Input

{paste gameplan here}
