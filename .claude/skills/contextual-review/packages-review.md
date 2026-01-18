# Packages Review Guidelines

Review guidelines for changes to the `packages/` directory containing published SDKs.

## Package Structure

```
packages/
├── server/     # @flowglad/server - Server-side SDK
├── react/      # @flowglad/react - React hooks and components
├── nextjs/     # @flowglad/nextjs - Next.js integration
└── shared/     # @flowglad/shared - Shared utilities and types
```

## Package Relationships

```
@flowglad/shared ← @flowglad/server
                ← @flowglad/react ← @flowglad/nextjs
```

- **shared**: Core types, utilities, Zod schemas - used by all other packages
- **server**: Server-side SDK with Express, Supabase, and better-auth integrations
- **react**: React hooks for client-side usage
- **nextjs**: Next.js-specific integration wrapping server and react packages

## Review Checklist

### Package.json Changes
- [ ] Version bumps are appropriate (semver compliance)
- [ ] Dependencies use `workspace:*` for internal packages
- [ ] Peer dependencies are specified correctly
- [ ] Export maps (`exports`) are complete and correct
- [ ] Types paths (`typesVersions`) match actual build output

### Build Configuration
- [ ] `tsup` configuration produces all necessary outputs (CJS, ESM, types)
- [ ] Entry points in `exports` field match build output
- [ ] Type declarations generate correctly

### API Surface Changes
- [ ] Public exports are intentional (check `src/index.ts`)
- [ ] Breaking changes are documented
- [ ] Deprecated APIs have migration guidance
- [ ] New APIs have JSDoc documentation

### Type Safety
- [ ] No `any` types in public API
- [ ] Generic types are appropriately constrained
- [ ] Zod schemas match TypeScript types
- [ ] Proper type inference for consumers

### Testing
- [ ] Unit tests cover new functionality
- [ ] Integration tests for cross-package behavior
- [ ] No mocking except for network calls
- [ ] Tests follow project guidelines (see CLAUDE.md)

## Package-Specific Guidelines

### @flowglad/server
- Supports multiple integrations: Express, Supabase, better-auth
- Each integration has separate entry point (`./express`, `./supabase`, `./better-auth`)
- Server-side only - no browser APIs

### @flowglad/react
- Hooks should follow React conventions (`use*` prefix)
- Components should be client-safe
- Avoid server-only dependencies

### @flowglad/nextjs
- Supports App Router patterns
- Server Components and Client Components clearly separated
- Route handlers follow Next.js conventions

### @flowglad/shared
- No framework-specific code
- Pure TypeScript/Zod utilities
- Minimal dependencies

## Version Management

### When to Bump Versions
- **Patch**: Bug fixes, documentation
- **Minor**: New features, non-breaking additions
- **Major**: Breaking changes

### Changeset Requirements
- Changes must have corresponding changeset file in `.changeset/`
- Changeset describes what changed and why
- Appropriate bump type selected

## Cross-Package Changes

When changes span multiple packages:
- [ ] Workspace dependencies updated consistently
- [ ] Types flow correctly between packages
- [ ] Tests pass across all affected packages
- [ ] Build order respects dependencies

## Consumer Impact

Consider how changes affect downstream users:
- [ ] New peer dependencies require user installation
- [ ] Changed exports may break imports
- [ ] Type changes may cause build failures
- [ ] Runtime behavior changes may break existing code
