# Playground Review Guidelines

Review guidelines for changes to the `playground/` directory containing example applications.

## Playground Projects

```
playground/
├── express/                      # Express.js example
├── generation-based-subscription/ # Usage-based billing example
├── react-native/                 # React Native example
└── seat-based-billing/           # Seat-based billing with BetterAuth
```

## Purpose

Playground projects serve as:
- **Reference implementations** for users integrating Flowglad
- **Integration tests** for the SDK packages
- **Documentation examples** (code may be referenced in docs)
- **Development environments** for testing SDK changes

## Review Checklist

### Code Quality
- [ ] Follows idiomatic patterns for the framework (Next.js, Express, etc.)
- [ ] Clear, readable code that serves as good example
- [ ] No hardcoded secrets or credentials
- [ ] Environment variables properly documented

### SDK Integration
- [ ] Uses workspace packages (`workspace:*`) not published versions
- [ ] Demonstrates correct SDK usage patterns
- [ ] Shows both success and error handling
- [ ] Covers common use cases

### Dependencies
- [ ] Uses `bun` as package manager
- [ ] Dependencies are up to date (or intentionally pinned)
- [ ] No unused dependencies
- [ ] DevDependencies vs dependencies correctly categorized

### Local Development
- [ ] Docker Compose for database setup where needed
- [ ] Clear setup instructions in README
- [ ] Environment variable templates (`.env.example`)
- [ ] Database migration scripts work correctly

## Project-Specific Guidelines

### seat-based-billing
- Uses BetterAuth for authentication
- Drizzle ORM for database
- Next.js App Router
- Focus on team/organization billing patterns

### generation-based-subscription
- Usage-based billing with metered features
- Demonstrates usage tracking and reporting
- Shows subscription lifecycle management

### express
- Minimal Express.js setup
- Server-side only integration
- Good starting point for Node.js backends

### react-native
- Mobile app integration patterns
- Client-side SDK usage
- Cross-platform considerations

## Common Patterns to Verify

### Authentication Flow
- [ ] Login/logout works correctly
- [ ] Session management is proper
- [ ] Protected routes are actually protected

### Billing Integration
- [ ] Checkout sessions create correctly
- [ ] Subscription status reflects properly
- [ ] Usage tracking records events

### UI Components
- [ ] Pricing tables render correctly
- [ ] Customer portal integration works
- [ ] Error states are handled gracefully

## Relationship to Documentation

Playground code may be:
- Referenced in documentation guides
- Used as source for code snippets
- Linked from SDK documentation

When modifying playground code:
- [ ] Check if code is referenced in `platform/docs/`
- [ ] Update documentation if behavior changes
- [ ] Keep code examples simple and focused

## Testing

Playground projects should be:
- [ ] Buildable (`bun run build` succeeds)
- [ ] Runnable locally with documented setup
- [ ] Working with current SDK versions
