# Global Context

This is a monorepo containing Flowglad's JavaScript/TypeScript SDK packages and platform code. Flowglad is a payments and billing platform that provides a stateless, developer-friendly way to handle subscriptions, usage meters, and feature gating.

**IMPORTANT**: This project uses `bun` as its package manager.

## Code Quality

- DO use Idiomatic Typescript
- DO avoid type assertions
- DO avoid code duplication
- DO leave jsdoc comments for complex functions and apis
- DO NOT use explicit `any`
- DO NOT use IIFEs
- DO NOT use nested ternarys

## platform/flowglad-next Context

```bash
bun install-packages
bun run test:setup # Docker must be running for tests to work
bun run test
bun check
```

### Testing

- no mocking unless absolutely necessary
- no spy.on
- never mock a pure function
- never mock the database - tests use real Postgres reads/writes

### After Finishing Edits

When you are finished making edits, run `bun run test` (if available) and `bun check`.