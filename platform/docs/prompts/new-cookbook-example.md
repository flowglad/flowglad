# New Cookbook Example Prompt

You are writing documentation for a Flowglad cookbook example. Your goal is to create a clear, concise guide that helps developers understand a specific pricing model implementation.

## Style Guidelines

- Use simple, direct language. Avoid frivolous or marketing-style prose.
- Balance code examples with plain English explanations.
- Use short sentences. Avoid filler words.
- Do not use phrases like "Let's dive in", "In this guide we'll explore", or similar.
- NEVER use em dashes (—). Use commas, parentheses, or separate sentences instead.

## Explanation Guidelines

**Code should be prominent, but context matters.**

- Before each code block, add 1-2 sentences explaining what the code does and why.
- After key code blocks, briefly explain important details or gotchas.
- Use explanations to connect code snippets into a coherent narrative.
- Highlight what makes this pricing model different from others.

**Good explanation patterns:**
- "This configuration defines X, which enables Y behavior."
- "The `checkUsageBalance` call returns the customer's remaining credits for this meter."
- "Note: The `transactionId` parameter ensures idempotency for duplicate requests."

**Avoid:**
- Restating what the code obviously does ("This imports the module")
- Long paragraphs that delay getting to the code
- Marketing language or unnecessary enthusiasm

## Code Sample Guidelines

**CRITICAL: Keep code samples SHORT and focused on business logic only.**

- Users can clone the full example from GitHub - don't reproduce entire files.
- Show only the essential lines that demonstrate the pricing model's unique patterns.
- Maximum ~20-30 lines per code block. If longer, trim to the key parts.
- Use `// ...` to indicate omitted boilerplate code.
- Focus on: API calls, billing checks, usage recording, feature gating.
- Skip: imports, error handling, UI components, provider setup boilerplate.

**What to INCLUDE:**
- Key function calls (`useBilling`, `checkUsageBalance`, `createUsageEvent`)
- Business logic specific to the pricing model
- Configuration snippets showing pricing model structure

**What to EXCLUDE or minimize:**
- Full file contents
- React Query setup, provider wrappers
- Error handling boilerplate
- UI/styling code
- Type definitions

## Required Structure

The document should follow this structure:

```mdx
---
title: [Pricing Model Name]
description: Learn how to implement [pricing model] in [Framework] with Flowglad.
---

[Brief 1-2 sentence description of what this example implements]

<Note>
View the complete source code on [GitHub](https://github.com/flowglad/examples/tree/main/[framework]/[example-name]).
</Note>

## Prerequisites

- Flowglad account with API key
- [Framework]-specific prerequisites

## Project Structure

[Show relevant file tree - keep it brief]

## Key Concepts

[1-2 paragraphs explaining what makes this pricing model unique and when to use it]

## Implementation

### Pricing Configuration

[1 sentence intro explaining what this config sets up]

[Show ABBREVIATED pricing.yaml - only the parts unique to this model, ~30 lines max]

[1-2 sentences explaining the key parts of the config]

### [Feature-specific section, e.g., "Checking Usage Balance"]

[1 sentence explaining what this code accomplishes]

[Code snippet - 10-20 lines max]

[Brief note about any important details]

### [Another feature section]

[Same pattern: intro sentence, code, follow-up note]

## Usage Examples

[Quick reference snippets with brief labels - 5-10 lines each]

## Next Steps

<CardGroup cols={2}>
  [Relevant links to SDK docs, other examples, etc.]
</CardGroup>
```

## Finding Code Examples

**IMPORTANT**: Use the `searchGitHub` tool to find the exact code from https://github.com/flowglad/examples.

Search patterns:
- `searchGitHub` with `repo: "flowglad/examples"` and relevant code patterns
- Search for framework-specific files like `route.ts`, `page.tsx`, `flowglad.ts`
- Search for pricing configuration like `pricing.yaml`

Do NOT invent code. Pull directly from the examples repository, then TRIM to essentials.

## Code Block Format

Use proper MDX code blocks with file paths that match the actual file path in the repository:

```ts src/lib/flowglad.ts
// Only show the key lines
const billing = useBilling();
const balance = billing.checkUsageBalance('generations');
// ...
```

**IMPORTANT**: The filename in the code block MUST match the exact path from the repository. For example, if the code comes from `src/app/api/usage-events/route.ts` in the flowglad/examples repo, use that exact path.

For YAML configs, show abbreviated versions or use diagrams:

```yaml pricing.yaml
# Key parts only - see full file in repo
usageMeters:
  - name: "Generations"
    slug: "generations"
    aggregationType: "sum"

products:
  - product:
      name: "Pro"
      slug: "pro_monthly"
    # ... see repo for full config
```

## Next Steps Card Links

**CRITICAL**: The docs use Mintlify, so card `href` values must match the actual URL paths derived from the docs file structure.

- File `sdks/auth.mdx` corresponds to URL path `/sdks/auth`
- File `features/usage.mdx` corresponds to URL path `/features/usage`
- File `examples/nextjs/generation-based-subscription.mdx` corresponds to `/examples/nextjs/generation-based-subscription`

**Always include a GitHub card** linking to the specific example in the flowglad/examples repo:

```mdx
<Card title="View Source Code" icon="github" href="https://github.com/flowglad/examples/tree/main/[framework]/[example-name]">
  Browse the complete example implementation
</Card>
```

**Only add cards with valid links**. Reference `docs.json` to verify URL paths exist before adding them. Common valid paths:

- `/sdks/nextjs`, `/sdks/react`, `/sdks/server` - SDK docs
- `/sdks/feature-access-usage` - Feature access and usage
- `/sdks/checkout-sessions` - Checkout sessions
- `/features/usage` - Usage meters
- `/features/subscriptions` - Subscriptions
- `/features/webhooks` - Webhooks
- `/examples/pricing-models` - Pricing models overview

## Framework-Specific Notes

### Next.js
- Use `@flowglad/nextjs` package
- Show App Router patterns (`app/` directory)
- Skip provider setup boilerplate - link to quickstart instead

### Vite
- Use `@flowglad/react` and `@flowglad/server` packages
- Show React component patterns

### React Native
- Use `@flowglad/react` package
- Show mobile-specific UI patterns

### Tanstack Start
- Use `@flowglad/react` and `@flowglad/server` packages
- Show Tanstack-specific routing patterns

## Pricing Models Reference

Common pricing models to document:

1. **Generation-based Subscription** - Hybrid model with subscriptions + usage credits + topups
2. **Tiered Usage-Gated Subscription** - Multiple tiers with feature gating (like ChatGPT)
3. **Usage Limit Subscription** - Base subscription with included credits + overage
4. **Pay As You Go** - Pure usage-based billing without subscription

## Checklist Before Completion

- [ ] All code examples pulled from flowglad/examples repo (verified via searchGitHub)
- [ ] Code blocks are SHORT (<30 lines each) and focused on business logic
- [ ] Each code block has a brief intro sentence explaining its purpose
- [ ] Key concepts are explained in plain English, not just shown in code
- [ ] No full file dumps - only essential snippets
- [ ] File paths in code blocks match EXACT paths from the repository (e.g., `src/app/api/usage-events/route.ts`)
- [ ] YAML configs are abbreviated with comments pointing to full file
- [ ] Link to source repository prominently displayed
- [ ] Total doc length is reasonable (aim for <200 lines of markdown)
- [ ] Next steps CardGroup includes GitHub link to the specific example
- [ ] All card href values are valid Mintlify paths (verified against docs.json)