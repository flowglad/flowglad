# Fan Gameplan

I'm providing:
1. A gameplan with patches and a dependency graph
2. Current state: list of completed patches (e.g., `Completed: [1, 2]`)
3. Optionally: a PR number (`pr`) to branch from

## Your Task

1. Parse the dependency graph and identify all **unblocked** patches
   (patches whose dependencies are all in the completed list)

2. For each unblocked patch, create `llm-prompts/patches/patch-{N}.md` using this template:

```template
# Patch {N}: {Title}

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
- Branch from: `{main if no pr specified, otherwise the pr's head branch}`
- Branch name: `patch-{N}-{descriptive-slug}`
- PR base: `{main if no pr specified, otherwise the pr's head branch}`
- After completing, run `bun run check` to verify lint/typecheck passes.
- Create a PR with title: "Patch {N}: {Title}"
```

3. Output a summary: "Created prompts for patches: [X, Y, Z]"

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

Given:
- Dependency graph: Patch 1 -> [], Patch 2 -> [1], Patch 3 -> [1], Patch 4 -> [2, 3]
- Completed: [1]
- PR: 1236

Unblocked patches: [2, 3] (both depend only on patch 1, which is complete)

Create:
- `llm-prompts/patches/patch-2.md`
- `llm-prompts/patches/patch-3.md`

Both should branch from PR 1236's head branch.

---

## Gameplan Input

{paste gameplan here}

## Current State

Completed: []

## PR (optional)

{PR number, or omit}
