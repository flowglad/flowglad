# New Changelog Entry Prompt

You are adding a new entry to the Flowglad changelog. Your goal is to create a clear, scannable changelog entry that helps users understand what changed and why it matters.

## Style Guidelines

- Use simple, direct language. Focus on what changed and the benefit to users.
- Lead with the user impact, not the technical implementation.
- Use short sentences. Avoid filler words.
- Do not use phrases like "We're excited to announce", "This release brings", or similar marketing language.
- NEVER use em dashes (—). Use commas, parentheses, or separate sentences instead.

## Content Guidelines

**Focus on user value:**
- What can users do now that they couldn't before?
- What problem does this fix?
- What workflow is now easier or faster?

**Good changelog patterns:**
- "Subscription upgrades now preserve your original billing cycle with automatic proration."
- "Fixed invoice status incorrectly showing as processing when payment was already confirmed."
- "Added YAML export for pricing models to share configurations across environments."

**Avoid:**
- Internal technical details that don't affect users
- Vague descriptions ("Various improvements", "Bug fixes")
- Marketing superlatives ("Revolutionary new feature", "Dramatically improved")

## PR Link Format

**CRITICAL**: All PR references must be converted to full GitHub links.

Convert `#123` to `[#123](https://github.com/flowglad/flowglad/pull/123)`

Multiple PRs should each have their own link:
- `#123, #124` becomes `[#123](https://github.com/flowglad/flowglad/pull/123), [#124](https://github.com/flowglad/flowglad/pull/124)`

## Required Structure

Each changelog entry uses the Mintlify `Update` component:

```mdx
<Update label="[Full Date]">
  ## Highlights

  - [Most important change with user benefit]. [#PR](https://github.com/flowglad/flowglad/pull/PR)
  - [Second most important change]. [#PR](https://github.com/flowglad/flowglad/pull/PR)
  - [Third highlight if applicable]. [#PR](https://github.com/flowglad/flowglad/pull/PR)

  ## New Features

  - [New capability description]. [#PR](https://github.com/flowglad/flowglad/pull/PR)
  - [Another new feature]. [#PR](https://github.com/flowglad/flowglad/pull/PR)

  ## Improvements & Fixes

  - [Enhancement or fix description]. [#PR](https://github.com/flowglad/flowglad/pull/PR)
  - [Another improvement]. [#PR](https://github.com/flowglad/flowglad/pull/PR)
</Update>
```

## Field Specifications

### `label` (Required)
The date of the release in a human-readable format.

**Format**: `"Month Day, Year"` (e.g., `"November 20, 2025"`)

### Section Headers

Use `##` headers to organize content within the Update component. **Always use these exact headers for consistency:**

| Section | Purpose | When to Include |
|---------|---------|-----------------|
| `## Highlights` | Top 2-4 most impactful changes | Always (if there are notable changes) |
| `## New Features` | New capabilities added | When new features were added |
| `## Improvements & Fixes` | Enhancements and bug fixes | When there are improvements or fixes |

## Entry Ordering

**Within the changelog file**: Most recent entries appear FIRST (reverse chronological order).

**Within each Update**: Order items by impact/importance, not alphabetically or by PR number.

## Writing Individual Items

### Highlights Section
- 2-4 items maximum
- Focus on user-facing impact
- Each item should be compelling enough to make users want to learn more

### New Features Section
- One item per feature
- Start with an action verb or the feature name
- Include enough detail to understand what it does

### Improvements & Fixes Section
- Group related fixes if they're minor
- Be specific about what was fixed ("Fixed X" not just "Fixed bug")
- Include context if the fix addresses a common issue

## Example Entry

```mdx
<Update label="November 20, 2025">
  ## Highlights

  - Import and export pricing models as YAML files for faster setup and easier sharing. [#657](https://github.com/flowglad/flowglad/pull/657), [#662](https://github.com/flowglad/flowglad/pull/662)
  - Get automatic email notifications when subscriptions are created or upgraded. [#405](https://github.com/flowglad/flowglad/pull/405)
  - Receive payout notifications when Stripe onboarding completes to streamline revenue flow. [#667](https://github.com/flowglad/flowglad/pull/667)

  ## New Features

  - Added YAML export for pricing models to download and share configurations. [#657](https://github.com/flowglad/flowglad/pull/657)
  - Introduced YAML import for pricing models to quickly set up models from existing configurations. [#662](https://github.com/flowglad/flowglad/pull/662)
  - Added customer subscription notification emails for created and upgraded subscriptions. [#405](https://github.com/flowglad/flowglad/pull/405)
  - Added GET price endpoint to fetch price details by ID via the API. [#689](https://github.com/flowglad/flowglad/pull/689)

  ## Improvements & Fixes

  - Fixed invoice status handling to only mark as awaiting payment confirmation when payment intent is actually processing. [#685](https://github.com/flowglad/flowglad/pull/685)
  - Fixed billing header to correctly display subscription intervals (daily, weekly, monthly, yearly) instead of defaulting to monthly. [#681](https://github.com/flowglad/flowglad/pull/681)
  - Prevented negative inputs in product amount fields with validation. [#679](https://github.com/flowglad/flowglad/pull/679)
  - Fixed product images from stretching or getting cropped on checkout pages. [#676](https://github.com/flowglad/flowglad/pull/676)
</Update>
```

## Frontmatter Requirements

The changelog page should have this frontmatter:

```mdx
---
title: "Changelog"
description: "Latest updates and changes to the Flowglad platform"
rss: true
---
```

The `rss: true` enables RSS feed generation at `/changelog/rss.xml` for subscribers.

## RSS Feed Considerations

The RSS feed only includes pure Markdown content. Components, code blocks, and HTML are excluded. If an update contains content that won't render well in RSS (like code samples or images), consider adding an `rss` property with alternative text.

## Checklist Before Completion

- [ ] Entry uses the `<Update>` component with `label` prop
- [ ] Date in `label` uses "Month Day, Year" format
- [ ] All PR references converted to full GitHub links
- [ ] Section headers use exact names: `## Highlights`, `## New Features`, `## Improvements & Fixes`
- [ ] Highlights section contains 2-4 impactful items
- [ ] Items are ordered by importance, not PR number
- [ ] Each item clearly describes user benefit or what was fixed
- [ ] Entry is placed at the TOP of the changelog (most recent first)
- [ ] No marketing language or vague descriptions
- [ ] No em dashes used