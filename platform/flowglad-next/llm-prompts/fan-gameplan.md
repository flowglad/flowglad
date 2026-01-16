# Fan Gameplan

I'm providing a gameplan with patches and a dependency graph (includes a **Project Name** in kebab-case).

**Directory Structure (Required):** Patch files must be created at:
```
llm-prompts/patches/{project-name}/patch-{N}.md
```
This structure is required for compatibility with `fan-patches.sh`, which spins up parallel Claude Code sessions.

## Retrieving Gameplans from Notion

**IMPORTANT:** If the user provides a Notion URL or a reference prefixed with `GP-` (e.g., `GP-123`), you MUST use the Notion skill to retrieve the gameplan contents. Simply fetching the URL will not work.

**Step 1: Verify Notion Authentication**

Before attempting to fetch from Notion, first run a simple Notion query (e.g., `/notion-find` with a basic search) to verify you're authenticated. If the query fails with an authentication error, prompt the user:

> "I need to access Notion to retrieve the gameplan, but I'm not authenticated. Please ensure the Notion MCP server is configured and authenticated, then try again."

**Step 2: Retrieve the Gameplan**

Once authenticated:
- **Notion URL** (e.g., `https://www.notion.so/...`): Use `/notion-find` or `/notion-search` to locate and retrieve the page contents.
- **GP- prefix** (e.g., `GP-42`): This refers to a Notion database entry. Use `/notion-database-query` or `/notion-find` to search for entries matching the GP identifier.

Do NOT attempt to use `WebFetch` or `curl` for Notion URLs—Notion requires authentication and the MCP Notion tools handle this automatically.

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

**IMPORTANT: Open a draft PR immediately after your first commit.** Do not wait until implementation is complete. This ensures the PR title format is correct from the start.

After your first commit, run:
```bash
gh pr create --draft --title "[{project-name}] Patch {N}: {Title}" --body "Work in progress" --base {base branch}
```

Then continue implementing. When finished:
1. Run `bun run check` to verify lint/typecheck passes
2. Update the PR description with a proper summary
3. Mark the PR as ready for review when complete

## PR Title (CRITICAL)
**You MUST use this EXACT title format:**

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
