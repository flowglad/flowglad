# Adjust Gameplan

I need to update an existing gameplan and propagate changes to active patches.

## Input

After this prompt, the user will provide two pieces of information:

1. **Gameplan identifier** (one of):
   - A Notion URL: Direct link to the gameplan page in the "Gameplans" DB
   - A gameplan slug: The kebab-case project name (e.g., `subscription-adjustments`)

2. **Description of changes needed**: What modifications to make to the gameplan (e.g., "Add error handling for expired subscriptions to Patch 3", "Move the database migration from Patch 2 to Patch 1", "Update design decision to use typed errors instead of strings")

## Your Task

### Step 1: Locate the Gameplan

If given a slug, search for it in Notion's "Gameplans" database.
If given a URL, fetch the gameplan directly.

### Step 2: Apply the Requested Changes

Review the current gameplan content and apply the changes described by the user. Common adjustment types include:
- Modifying patch scope or instructions
- Adding/removing patches
- Changing acceptance criteria
- Updating design decisions
- Clarifying ambiguous instructions

### Step 3: Update the Gameplan in Notion

Update the Notion page with the revised gameplan content.

### Step 4: Detect Patch Status

Extract the **Project Name** from the gameplan.

**Detect merged patches**:
```bash
gh pr list --state merged --search "[{project-name}]" --json number,title
```
Parse results to find PRs matching `[{project-name}] Patch {N}: ...` and extract patch numbers.

**Detect open PRs**:
```bash
gh pr list --state open --search "[{project-name}]" --json number,title,headRefName
```
Build a map of patch number → open PR info (number, headRefName, title).

### Step 5: Identify Patches Needing Adjustment

For each patch that is NOT merged:
1. Check if it has an open PR (work in progress)
2. Check if it's unblocked per the dependency graph (all dependencies merged or have open PRs)
3. Determine which sections of the gameplan changed and whether those changes affect this patch

Categorize patches into:
- **Active patches** (have open PRs) - need adjustment prompts sent to running agents
- **Queued patches** (unblocked, no open PR yet) - will pick up changes when started via fan-gameplan
- **Blocked patches** (dependencies not met) - no action needed now

### Step 6: Generate Adjustment Prompts

For each **active patch** (has an open PR) that is affected by the gameplan changes:

Create `llm-prompts/patches/{project-name}/patch-{N}-adjustment.md`:

```markdown
# [{project-name}] Patch {N} Adjustment

## Context
This is an adjustment to your in-progress work on Patch {N}.
The gameplan has been updated and the following changes affect your patch.

## What Changed in the Gameplan
{Summarize ONLY the changes relevant to this specific patch}

## How This Affects Your Work

### Modified Instructions
{If patch instructions changed, show the diff or new instructions}

### Modified Design Decisions
{If relevant design decisions changed, explain the new decisions}

### Modified Test Requirements
{If test requirements for this patch changed, show new requirements}

## Action Required

1. Review the changes above
2. Assess your current progress against the new requirements
3. Adjust your implementation accordingly
4. If you've already completed work that conflicts with these changes, refactor as needed
5. Update your PR description if the scope changed significantly

## PR Reference
- PR #{pr_number}: {pr_title}
- Branch: `{headRefName}`
```

### Step 7: Output Summary

Report:
```
Gameplan Updated: {project-name}

Changes Made:
- {brief summary of each change}

Patch Status:
- Merged: [{list}]
- Active (adjustment prompts created): [{list with PR numbers}]
- Queued (will pick up changes on start): [{list}]
- Blocked: [{list}]

Files Created:
- llm-prompts/patches/{project-name}/patch-{N}-adjustment.md
- ...
```

---

## Example

**Input**:
- Gameplan: `subscription-adjustments`
- Changes: "Add edge case handling for expired subscriptions to Patch 3. Also update the design decision about error handling to use typed errors instead of generic strings."

**Step 4 results**:
- Merged: [1, 2]
- Open PRs: {3: PR #150, 5: PR #152}

**Gameplan changes**:
- Updated Patch 3 instructions to include additional edge case handling
- Modified a design decision about error handling

**Step 5 analysis**:
- Patch 3: Active (PR #150), affected by instruction change → needs adjustment
- Patch 4: Blocked (depends on 3) → no action
- Patch 5: Active (PR #152), not affected by changes → no adjustment needed
- Patch 6: Queued (depends on 5) → will pick up changes via fan-gameplan

**Output**:
```
Gameplan Updated: subscription-adjustments

Changes Made:
- Patch 3: Added edge case handling for expired subscriptions
- Design decision: Changed error handling to throw typed errors

Patch Status:
- Merged: [1, 2]
- Active (adjustment prompts created): [3]
- Active (no changes needed): [5]
- Queued: [6]
- Blocked: [4]

Files Created:
- llm-prompts/patches/subscription-adjustments/patch-3-adjustment.md
```

---

## Notes

- Only create adjustment prompts for patches that are actually affected by the changes
- Be specific about what changed — agents shouldn't have to re-read the entire gameplan
- If a change fundamentally invalidates completed work, be explicit about what needs to be redone
- Preserve the original PR title format when referencing PRs
