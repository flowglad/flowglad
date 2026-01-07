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

The `pricing.yaml` file defines [brief description of what it configures]. See the [full configuration](https://github.com/flowglad/examples/blob/main/[framework]/[example-name]/pricing.yaml) in the repository.

**SVG DIAGRAM:** Create a separate `.svg` file in the `images/` directory and reference it in MDX like this:

```mdx
![pricing diagram](/images/[example-name]-diagram.svg)
```

**Brand colors for dark mode (primary theme):**
- Primary light (strokes/arrows): `#ffc898`
- Container background: `#3f3935`
- Inner box background: `#45403d`
- Primary text: `#fbfaf4`
- Secondary text: `#ccc2a9`
- Border radius: `rx="4"` for inner boxes, `rx="6"` for containers

**SVG structure pattern:**

```html
<svg viewBox="0 0 800 620" xmlns="http://www.w3.org/2000/svg" style="font-family: system-ui, sans-serif; max-width: 100%;">
  <!-- Arrow marker definition -->
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#ffc898"/>
    </marker>
  </defs>

  <!-- Usage Meters Section -->
  <g>
    <rect x="50" y="20" width="700" height="90" rx="6" fill="#3f3935" stroke="#ffc898" stroke-width="1.5"/>
    <text x="400" y="45" text-anchor="middle" font-weight="600" font-size="14" fill="#fbfaf4">USAGE METERS</text>
    <!-- Meter boxes -->
    <rect x="120" y="55" width="200" height="45" rx="4" fill="#45403d" stroke="#ffc898"/>
    <text x="220" y="75" text-anchor="middle" font-size="12" fill="#fbfaf4">meter_name</text>
    <text x="220" y="90" text-anchor="middle" font-size="10" fill="#ccc2a9">(sum aggregation)</text>
  </g>

  <!-- Arrows from meters -->
  <path d="M250 110 L250 140 L220 170" stroke="#ffc898" stroke-width="1.5" fill="none" marker-end="url(#arrowhead)"/>
  <path d="M550 110 L550 140 L580 170" stroke="#ffc898" stroke-width="1.5" fill="none" marker-end="url(#arrowhead)"/>

  <!-- Subscription Tiers Section -->
  <g>
    <rect x="50" y="170" width="340" height="300" rx="6" fill="#3f3935" stroke="#ffc898" stroke-width="1.5"/>
    <text x="220" y="195" text-anchor="middle" font-weight="600" font-size="14" fill="#fbfaf4">SUBSCRIPTION TIERS</text>
    <text x="220" y="212" text-anchor="middle" font-size="10" fill="#ccc2a9">(renews every billing period)</text>
    <!-- Tier boxes -->
    <rect x="70" y="225" width="300" height="45" rx="4" fill="#45403d" stroke="#ffc898"/>
    <text x="220" y="248" text-anchor="middle" font-weight="600" font-size="12" fill="#fbfaf4">Free $0/mo</text>
    <text x="220" y="263" text-anchor="middle" font-size="10" fill="#ccc2a9">No credits</text>
  </g>

  <!-- Top-ups Section -->
  <g>
    <rect x="410" y="170" width="340" height="180" rx="6" fill="#3f3935" stroke="#ffc898" stroke-width="1.5"/>
    <text x="580" y="195" text-anchor="middle" font-weight="600" font-size="14" fill="#fbfaf4">TOP-UPS</text>
    <text x="580" y="212" text-anchor="middle" font-size="10" fill="#ccc2a9">(one-time purchase)</text>
    <!-- Top-up boxes -->
    <rect x="430" y="225" width="300" height="50" rx="4" fill="#45403d" stroke="#ffc898"/>
    <text x="580" y="248" text-anchor="middle" font-weight="600" font-size="12" fill="#fbfaf4">Credit Pack $X</text>
    <text x="580" y="265" text-anchor="middle" font-size="10" fill="#ccc2a9">+N credits</text>
  </g>
</svg>
```

**Reference example:** See `/images/generation-based-diagram.svg` for a complete implementation.

[1-2 sentences explaining the key distinction of this pricing model, e.g., renewalFrequency settings or feature toggles vs usage grants]

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

For pricing configurations, create SVG diagram files and reference them in the MDX. This makes the pricing model structure immediately clear and renders nicely in documentation.

**SVG diagram file creation:**
1. Create a new `.svg` file in the `images/` directory (e.g., `images/[example-name]-diagram.svg`)
2. Reference in MDX with standard markdown image syntax:
   ```mdx
   ![pricing diagram](/images/[example-name]-diagram.svg)
   ```

**SVG diagram guidelines:**
- Use `viewBox` for responsive scaling (e.g., `viewBox="0 0 800 620"`)
- Use dark mode colors for the page background (`#2d2a28`):
  - Container fills: `#3f3935`
  - Inner box fills: `#45403d`
  - Strokes/arrows: `#ffc898` (primary light)
  - Primary text: `#fbfaf4`
  - Secondary text: `#ccc2a9`
- Use `rx="4"` for inner boxes, `rx="6"` for container boxes
- Include arrow marker definition in `<defs>` section
- Keep font sizes readable: 12-14px for labels, 10px for descriptions

Always link to the full `pricing.yaml` in the GitHub repo for users who want the exact configuration.

## Next Steps Card Links

**CRITICAL**: The docs use Mintlify, so card `href` values must match the actual URL paths derived from the docs file structure.

- File `sdks/auth.mdx` corresponds to URL path `/sdks/auth`
- File `features/usage.mdx` corresponds to URL path `/features/usage`
- File `guides/nextjs/generation-based-subscription.mdx` corresponds to `/guides/nextjs/generation-based-subscription`

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
- `/guides/pricing-models` - Pricing models overview

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
- [ ] Pricing model SVG diagram created in `images/` directory and referenced with `![pricing diagram](/images/[name]-diagram.svg)`
- [ ] Link to source repository prominently displayed
- [ ] Total doc length is reasonable (aim for <200 lines of markdown)
- [ ] Next steps CardGroup includes GitHub link to the specific example
- [ ] All card href values are valid Mintlify paths (verified against docs.json)