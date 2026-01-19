# Documentation Review Guidelines

Review guidelines for changes to `platform/docs/`.

## Directory Structure

```
platform/docs/
├── docs.json           # Navigation and theme configuration
├── *.mdx               # Top-level pages (quickstart, faq, etc.)
├── api-reference/      # OpenAPI-generated API docs
├── features/           # Feature documentation
├── guides/             # Framework-specific guides
├── sdks/               # SDK documentation
├── images/             # Documentation images
├── fonts/              # Custom font files
├── logo/               # Logo assets
└── snippets/           # Reusable MDX snippets
```

## Key Files

- **docs.json**: Mintlify configuration defining navigation tabs, groups, pages, theme colors, fonts, and integrations
- **style.css**: Custom CSS overrides

## Review Checklist

### Content Quality
- [ ] Clear, concise writing without jargon
- [ ] Code examples are correct and runnable
- [ ] Links work and point to correct destinations
- [ ] Images have appropriate alt text and are optimized

### Navigation Changes (docs.json)
- [ ] New pages added to appropriate group/tab
- [ ] Page order is logical within groups
- [ ] No orphaned pages (files without navigation entries)
- [ ] Tab structure makes sense for user journey

### MDX Syntax
- [ ] Proper frontmatter if required
- [ ] Code blocks have correct language identifiers
- [ ] Component imports work (if using custom components)
- [ ] No broken MDX syntax

### SDK/API Consistency
- [ ] SDK examples match actual SDK API
- [ ] API reference aligns with OpenAPI spec at `https://app.flowglad.com/api/openapi`
- [ ] Version numbers are current
- [ ] Import paths are correct

### Cross-Reference Integrity
- [ ] Internal links use correct paths
- [ ] Snippets referenced correctly
- [ ] No circular dependencies between pages

## Common Issues

### Mintlify-Specific
- Pages must be listed in `docs.json` to appear in navigation
- OpenAPI reference auto-generates from external source
- Image paths should be relative from docs root (`/images/...`)

### Content Guidelines
- Use second person ("you") for instructions
- Keep code examples minimal but complete
- Include both success and error scenarios in API examples
- Link to related pages when mentioning concepts

## Integration Points

Docs reference external systems:
- **OpenAPI spec**: Auto-generated from `https://app.flowglad.com/api/openapi`
- **SDKs**: Must match packages `@flowglad/server`, `@flowglad/react`, `@flowglad/nextjs`
- **Dashboard links**: Point to `https://app.flowglad.com`
