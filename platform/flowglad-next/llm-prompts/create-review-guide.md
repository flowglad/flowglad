# Create Review Guide from Gameplan

You will be given a gameplan document that describes a multi-patch implementation plan. Your job is to create a **Review Guide** that enables parallel, independent review of each patch by separate agents.

## Input

A gameplan document structured per `new-gameplan.md`, containing:
- Problem Statement
- Solution Summary
- Current State Analysis
- Required Changes
- Acceptance Criteria
- Patches (numbered, with file changes and test cases)
- Dependency Graph

## Output

A Review Guide with the following structure:

---

### Header

```markdown
# Review Guide: {Gameplan Title}

This document provides review instructions for Patches 1-N of {project-name}.
Each section is designed as a **stovepiped research path** for an independent reviewer.
Reviewers should focus on their assigned section without assuming knowledge of other sections.

**Source Gameplan:** {link or filename}
**Total Patches:** N
```

---

### For Each Patch, Create a Section

```markdown
## Section {N}: {Patch Title}

### Files to Review
{List the files from the patch with specific line ranges to focus on}

### Theory of Change
{2-3 sentences explaining WHY this patch exists and what it accomplishes in the broader migration}

### Complexity Hotspots
{Bullet list of the most complex parts of this patch - where bugs are likely to hide}
- {File}:{function/area} - {why it's complex}

### Subtlety Alerts
{Things that might look fine but have non-obvious implications}
- {Describe the subtle concern and what to look for}

### Review Checklist
{Specific questions the reviewer should answer}
- [ ] Does {specific change} correctly handle {edge case}?
- [ ] Is the migration path safe for {scenario}?
- [ ] Are the test cases sufficient for {specific behavior}?

### Expected Test Coverage
{What tests should exist for this patch - reviewer should verify they're present and adequate}

### Red Flags to Watch For
{Anti-patterns or mistakes that would indicate a problem}
- {Specific thing that would be wrong}

### Cross-Cutting Concerns
{How this patch interacts with other patches - what assumptions it makes about patches it depends on}
```

---

### Final Section: Holistic Review

```markdown
## Section {N+1}: Holistic Review

This section reviews the **sum of all patches** and catches issues that only emerge when viewing the changes as a whole.

### Integration Points
{Where patches connect to each other - seams that need scrutiny}

### Data Migration Safety
{Review the overall data migration strategy - are there race conditions, rollback concerns, or data integrity risks?}

### Behavioral Consistency
{Does the system behave consistently before, during, and after the migration?}

### API Contract Preservation
{Are external APIs preserved? Are breaking changes properly documented?}

### Performance Implications
{Combined performance impact of all changes}

### Rollback Strategy
{Can each patch be rolled back independently? What's the overall rollback story?}

### Missing Coverage
{What scenarios might fall through the cracks between patches?}

### Review Checklist
- [ ] All patches pass their individual acceptance criteria
- [ ] Cross-patch dependencies are correctly ordered
- [ ] No behavioral regressions in the combined diff
- [ ] Test coverage collectively addresses all acceptance criteria from the gameplan
```

---

## Guidelines for Creating the Review Guide

1. **Be Specific, Not Generic**
   Don't write "check for edge cases" - write "verify that nullable `productId` is handled when `priceType` is `usage`"

2. **Mirror the Gameplan Structure**
   Each patch in the gameplan gets exactly one section in the review guide. The section numbers should match.

3. **Identify Complexity by Reading the Gameplan**
   Look for:
   - Schema changes (high risk)
   - Changes to core business logic
   - New validation rules
   - Changes to existing function signatures
   - Anything touching payments, subscriptions, or billing

4. **Identify Subtlety by Inferring Implications**
   Look for:
   - Implicit assumptions in the gameplan
   - Things that "should" work but aren't explicitly tested
   - Interactions between patches that aren't spelled out
   - Edge cases mentioned but not fully addressed

5. **Theory of Change Should Be Concise**
   One paragraph max. The reviewer needs to understand the "why" quickly so they can evaluate whether the "how" achieves it.

6. **Red Flags Should Be Actionable**
   Not "code might be wrong" but "if you see X, that indicates Y problem"

7. **Cross-Cutting Concerns Enable the Holistic Reviewer**
   Each patch section should note what it assumes about other patches. The holistic reviewer uses these to verify the assumptions hold.

8. **Checklist Items Should Be Yes/No Questions**
   Make them specific enough that a reviewer can definitively answer them.

---

## Usage

Once the Review Guide is created:

1. **Parallel Review**: Assign each Section 1-N to a separate agent with the prompt:
   ```
   Read {GAMEPLAN_FILE} and {REVIEW_GUIDE_FILE}
   Your task is to review Section {N}
   ```

2. **Holistic Review**: Assign Section N+1 to an agent (ideally after patches 1-N are reviewed, or in parallel with more context)

3. **Findings Collection**: Direct each agent to append findings to a shared `ISSUES.md`:
   ```
   Find or create ISSUES.md in the repo root.
   Create a section for Patch {N} with your findings.
   ```

---

## Example Transformation

**Gameplan Patch:**
```markdown
### Patch 3: Update Price Schema

**Files:**
- `src/db/schema/prices.ts` - Make `productId` nullable
- `src/db/schema/prices.ts` - Add `usageMeterId` column

**Test Cases:**
- Verify existing prices with productId still work
- Verify new usage prices can be created without productId
```

**Review Guide Section:**
```markdown
## Section 3: Update Price Schema

### Files to Review
- `src/db/schema/prices.ts:15-45` - Column definitions
- Migration file generated from schema change

### Theory of Change
This patch decouples usage prices from products by making `productId` nullable and adding `usageMeterId`. This is foundational - later patches depend on this schema being correct.

### Complexity Hotspots
- `prices.ts`:column constraints - The combination of nullable `productId` and required `usageMeterId` for usage prices needs careful constraint design

### Subtlety Alerts
- Existing queries that JOIN prices to products may silently return fewer rows if they use INNER JOIN
- RLS policies that reference `productId` need updating to handle NULL

### Review Checklist
- [ ] Is `productId` nullable ONLY for usage price types?
- [ ] Does the migration handle existing data correctly?
- [ ] Are database constraints sufficient to prevent invalid states (e.g., usage price with productId but no usageMeterId)?

### Red Flags to Watch For
- Any `NOT NULL` constraint on `productId` remaining
- Missing index on `usageMeterId` for query performance
- Migration that doesn't backfill or validate existing data
```
